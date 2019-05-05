/**
 * node api
 * child_process.fork(modulePath[, args][, options])
 * modulePath: <string> 要在子进程中运行的模块。
 * args <string[]> 字符串参数的列表。
 * options <Object>
 *     cwd <string> 子进程的当前工作目录。
 *     detached <boolean> 准备子进程独立于其父进程运行。具体行为取决于平台，参阅 options.detached。
 *     env <Object> 环境变量的键值对。
 *     execPath <string> 用于创建子进程的可执行文件。
 *     execArgv <string[]> 传给可执行文件的字符串参数的列表。默认值: process.execArgv。
 *     silent <boolean> 如果为 true，则子进程的 stdin、stdout、stderr 会被输送到父进程，否则它们会继承自父进程，详见 child_process.spawn() 的 stdio 中的 'pipe' 和 'inherit' 选项。默认值: false。
 *     stdio <Array> | <string> 参阅 child_process.spawn() 的 stdio。当提供此选项时，则它覆盖 silent 选项。如果使用了数组变量，则它必须包含一个值为 'ipc' 的元素，否则会抛出错误。例如 [0, 1, 2, 'ipc']。
 *     windowsVerbatimArguments <boolean> 在 Windows 上不为参数加上引号或转义。在 Unix 上则忽略。默认值: false。
 *     uid <number> 设置进程的用户标识
 *     gid <number> 设置进程的群组标识，
 *  允许消息在父进程和子进程之间来回传递。
 *  注意，衍生的 Node.js 子进程独立于父进程，但两者之间建立的 IPC 通信通道除外。 每个进程都有自己的内存，带有自己的 V8 实例。 由于需要额外的资源分配，因此不建议衍生大量的 Node.js 子进程。
 *  默认情况下， child_process.fork() 会使用父进程的 process.execPath 衍生新的 Node.js 实例。
 *
 *
 * https://juejin.im/post/5af90988518825426a1fcc2e
 */
const { fork } = require('child_process');  //node的子进程管理


const { join } = require('path');
const http = require('http');
const puppeteer = require('puppeteer');     //自动测试
const { existsSync, readdirSync } = require('fs');  //文件的操作

module.exports = function(opts = {}) {
  const {
    fixtures,       //需要测试的路径
    basePort,       //端口
  } = opts;

  let port = basePort || 12400;
  let browser;
  let page;
  const servers = {};

  let dirs = readdirSync(fixtures).filter(dir => dir.charAt(0) !== '.');    //按照路读取文件

  //some找到包含 '-only' 的路径
  if (dirs.some(dir => dir.includes('-only'))) {
      //过滤出包含'-only'的
    dirs = dirs.filter(dir => dir.includes('-only'));
  }

  //创建服务
  async function serve(base, key) {
    return new Promise((resolve) => {
      port += 1;
      servers[key] = { port };
      servers[key].server = http.createServer((request, response) => {
          //返回一个静态服务
        return require('serve-static')(base)(request, response);
      });
      servers[key].server.listen(port, () => {
        console.log(`[${key}] Running at http://localhost:${port}`);
        resolve();
      });
    });
  }

  async function build(base) {
    return new Promise((resolve, reject) => {
      const umiPath = join(process.cwd(), './node_modules/umi/bin/umi.js');
      const env = {
        COMPRESS: 'none',
        PROGRESS: 'none',
      };
      const child = fork(umiPath, ['build'], {
        cwd: base,
        env,
      });
      child.on('exit', code => {
        if (code === 1) {
          reject(new Error('Build failed'));
        } else {
          resolve();
        }
      });
    });
  }




  //开启测试部分
  beforeAll(async () => {
    for (const dir of dirs) {
      const base = join(fixtures, dir);
      const targetDist = join(base, 'dist');
      if (!existsSync(targetDist)) {
        await build(base);
      }
      await serve(targetDist, dir);
    }
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  });

  //开启测试部分
  beforeEach(async () => {
    page = await browser.newPage();
  });

  for (const dir of dirs) {
      //开启测试
    test(dir, async () => {
      await require(join(fixtures, `${dir}/test`)).default({
        page,
        host: `http://localhost:${servers[dir].port}`,
      });
    });
  }

  //开启测试部分
  afterAll(() => {
    Object.keys(servers).forEach(key => {
      servers[key].server.close();
    });
    if (browser) browser.close();
  });
}
