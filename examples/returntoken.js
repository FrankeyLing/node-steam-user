// server.js

const readline = require('readline');
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp'); // Ensure to require steam-totp if using two-factor authentication


const STEAM_ACCOUNT_NAME = 'username'; // Your Steam account username
const STEAM_ACCOUNT_PASSWORD = 'password'; // Your Steam account password
const STEAM_ACCOUNT_2FA_SECRET = ''; // Your shared_secret if you have mobile authentication enabled, or blank to prompt for a code from stdin

const defaultOptions = require('../resources/default_options.js');

let user = new SteamUser(defaultOptions);

function logOnToSteam() {
    return new Promise((resolve, reject) => {
        user.logOn({
            accountName: STEAM_ACCOUNT_NAME,
            password: STEAM_ACCOUNT_PASSWORD,
            twoFactorCode: STEAM_ACCOUNT_2FA_SECRET ? SteamTotp.generateAuthCode(STEAM_ACCOUNT_2FA_SECRET) : undefined
        });

        user.on('loggedOn', () => {
            console.log('Logged on to Steam');
            resolve();
        });

        user.on('error', (err) => {
            reject(err);
        });
    });
}

function getToken(appid, depotid, vhost) {
    return new Promise(async (resolve, reject) => {
        try {
            //   let { servers } = await user.getContentServers(appid);
            //   let server1 = servers[0];
            let token = await user.getCDNAuthToken(appid, depotid, vhost);
            resolve(token.token);
        } catch (err) {
            reject(err);
        }
    });
}

// 创建一个接口来读取标准输入
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// 登录到Steam
logOnToSteam()
    .then(() => {
        console.log('Steam login successful. Ready to accept input.');
        // 监听标准输入
        rl.on('line', async (line) => {
            try {
                // 解析输入的JSON数据
                const data = JSON.parse(line);
                const appid = parseInt(data.key1);
                const depotid = parseInt(data.key2);
                const vhost = data.key3;

                // 调用函数并输出结果
                const token = await getToken(appid, depotid, vhost);
                console.log(JSON.stringify({ token: token }));
            } catch (err) {
                console.error(JSON.stringify({ error: err.message }));
            }
        });
    })
    .catch((err) => {
        console.error(`Steam login failed: ${err.message}`);
        process.exit(1); // Exit the process if login fails
    });
