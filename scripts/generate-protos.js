const ChildProcess = require('child_process');
const FS = require('fs');
const Path = require('path');

const PBJS_BINARY_PATH = Path.join(__dirname, '..', 'node_modules', 'protobufjs', 'bin', 'pbjs');
const PROTO_FILE_PATH = Path.join(__dirname, '..', 'protobufs', '%s.proto');
const DESTINATION_PATH = Path.join(__dirname, '..', 'protobufs', 'generated', '%s.json');
const PBJS_COMMAND_LINE = `node "${PBJS_BINARY_PATH}" --target json --out "${DESTINATION_PATH}" --keep-case "${PROTO_FILE_PATH}"`;
const GENERATED_DIR = Path.join(__dirname, '..', 'protobufs', 'generated');

const OVERRIDE_TYPEDEF_TYPES = {
	Proto_CMsgClientLicenseList_License: {
		payment_method: 'EPaymentMethod',
		flags: 'ELicenseFlags',
		license_type: 'ELicenseType'
	}
};

const GENERATED_FILE_HEADER = `/* eslint-disable */\n// Auto-generated by generate-protos script on ${(new Date()).toString()}\n\n`;

let loader = GENERATED_FILE_HEADER;
loader += "const Schema = module.exports;\nconst {Root} = require('protobufjs');\n\n";

if (!FS.existsSync(GENERATED_DIR)) {
	FS.mkdirSync(GENERATED_DIR);
}

// First we want to delete the contents of the generated dir
FS.readdirSync(GENERATED_DIR).forEach((filename) => {
	console.log(`Delete ${filename}`);
	FS.unlinkSync(Path.join(GENERATED_DIR, filename));
});

let typesFile = FS.openSync(Path.join(GENERATED_DIR, '_types.js'), 'w');
let documentedTypes = {}; // Some types might be defined in multiple proto files. Let's only include each type once.

FS.writeSync(typesFile, GENERATED_FILE_HEADER);

FS.readdirSync(__dirname + '/../protobufs').forEach((filename) => {
	if (!filename.match(/\.proto$/)) {
		return;
	}

	let filenameWithoutExtension = filename.replace('.proto', '');
	let cmdLine = PBJS_COMMAND_LINE.replace(/%s/g, filenameWithoutExtension);
	console.log(cmdLine);

	ChildProcess.execSync(cmdLine);
	loader += `mergeObjects(Schema, Root.fromJSON(require('./${filenameWithoutExtension}.json')));\n`;

	let protoDefinition = require(Path.join(GENERATED_DIR, `${filenameWithoutExtension}.json`));
	if (protoDefinition.nested) {
		FS.writeSync(typesFile, `///////////////////////////////////////////////\n// ${filenameWithoutExtension}.proto\n///////////////////////////////////////////////\n\n`);
		FS.writeSync(typesFile, writeTypedef(protoDefinition.nested));
	}
});

FS.closeSync(typesFile);

console.log('Generating _load.js');
loader += `\n${mergeObjects.toString()}\n`;
FS.writeFileSync(GENERATED_DIR + '/_load.js', loader);

function mergeObjects(destinationObject, sourceObject) {
	for (let i in sourceObject) {
		if (Object.hasOwnProperty.call(sourceObject, i)) {
			destinationObject[i] = sourceObject[i];
		}
	}
}

function writeTypedef(obj, namespace = '.') {
	let output = '';

	for (let i in obj) {
		// skip options, nested messages, and enums
		if (i == 'options' || i == 'nested' || i == 'google' || obj[i].type || obj[i].values) {
			continue;
		}

		if (documentedTypes[namespace + i]) {
			// We already documented this type
			continue;
		}

		documentedTypes[namespace + i] = true;

		let resolvedName = 'Proto' + (namespace + i).replace(/\./g, '_');
		output += `/**\n * @typedef {object} ${resolvedName}\n`;
		for (let j in obj[i].fields) {
			let type = protobufTypeToJsType(obj[i].fields[j].type);
			let name = j;

			if (type == 'number' && ['eresult', 'eResult', 'result'].includes(name)) {
				type = 'EResult';
			}

			if (OVERRIDE_TYPEDEF_TYPES[resolvedName] && OVERRIDE_TYPEDEF_TYPES[resolvedName][j]) {
				type = OVERRIDE_TYPEDEF_TYPES[resolvedName][j];
			}

			switch (obj[i].fields[j].rule) {
				case 'repeated':
					type += '[]';
					break;

				case 'required':
					break;

				default:
					// optional
					// Does this field have a default value?
					if (obj[i].fields[j].options && !['undefined', 'string'].includes(typeof obj[i].fields[j].options.default)) {
						name = `[${name}=${obj[i].fields[j].options.default}]`;
					} else {
						name = `[${name}]`;
					}
			}

			output += ` * @property {${type}} ${name}\n`;
		}
		output += ' */\n\n';

		// Do we have nested messages?
		if (obj[i].nested) {
			output += writeTypedef(obj[i].nested, namespace + i + '.');
		}
	}

	return output;

	function protobufTypeToJsType(type) {
		switch (type) {
			case 'double':
			case 'float':
			case 'int32':
			case 'uint32':
			case 'sint32':
			case 'fixed32':
			case 'sfixed32':
				return 'number';

			case 'int64':
			case 'uint64':
			case 'sint64':
			case 'fixed64':
			case 'sfixed64':
				// 64-bit numbers are represented as strings
				return 'string';

			case 'bool':
				return 'boolean';

			case 'string':
				return 'string';

			case 'bytes':
				return 'Buffer';

			default:
				if (type[0] == '.') {
					// It's another protobuf msg, or an enum
					if (type[1] == 'E') {
						// It's an enum
						return type.substring(1);
					}

					return 'Proto' + type.replace(/\./g, '_');
				}

				throw new Error(`Unknown protobuf type ${type}`);
		}
	}
}
