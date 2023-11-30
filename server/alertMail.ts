import { Config, sleep } from './utils';
import nodemailer from 'nodemailer';
import { resolve } from 'dns/promises';

let transport: ReturnType<typeof nodemailer.createTransport>;

let targets: string[] = [];
let from: string = '';
let serviceHostName: string = '';
let disabled: boolean = false;

export function alertMailInit(initConfig: Config) {
  const {
    alertMail: {
      disabled: cfgDisabled = false,
      transportOptions,
      targets: cfgTargets,
      serviceHostName: cfgServiceHostName,
    },
  } = initConfig;
  transport = nodemailer.createTransport({
    ...transportOptions,
    secure: true,
  });
  targets = cfgTargets;
  from = transportOptions.auth.user;
  serviceHostName = cfgServiceHostName;
  disabled = cfgDisabled;
}

let sendingAlerts = false;
let queueRead = false;
const queue: { subject: string; text: string }[] = [];

export function enqueueAlertText(subject: string, text: string) {
  queue.push({ subject, text });
  if (sendingAlerts) {
    if (queueRead) {
      sendAlertTexts();
    }
    return;
  } else {
    sendAlertTexts();
  }
  sendingAlerts = true;
}

async function sendAlertTexts() {
  try {
    console.log('sending alerts');
    while (true) {
      try {
        await resolve(serviceHostName);
        break;
      } catch (exc) {}
      await sleep(60 * 1000);
    }
    const localQueue = queue.slice();
    queue.splice(0, queue.length);
    queueRead = true;
    const promises: Promise<any>[] = [];
    localQueue.forEach(({ subject, text }) => {
      targets.forEach((to) => {
        promises.push(
          new Promise((resolve, reject) => {
            transport.sendMail({ from, to, subject, text }, (err, info) => {
              if (err) {
                reject(err);
              } else {
                resolve(info);
              }
            });
          })
        );
      });
    });
    return await Promise.all(promises);
  } catch (exc) {
    console.log('[Mail Alert]', 'exc =', exc);
  } finally {
    sendingAlerts = false;
  }
}
