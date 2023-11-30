import * as bodyParser from 'body-parser';
import express from 'express';
import { createServer } from 'http';
import fetch from 'node-fetch';
import { hostname } from 'os';
import { resolve } from 'path';
import { alertMailInit, enqueueAlertText } from './alertMail';
import { config, setIntervalDayAligned } from './utils';

const CORS = false;
const DEBUG = false;

const app = express();
const server = createServer(app);

if (CORS) {
  app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
}

app.use(express.static(resolve(__dirname, '../dist')));
app.use(bodyParser.json({ limit: '50mb' }));

app.get('/email-alert/:subject/:text', async (req, res) => {
  if (Object.keys(req.query).length) {
    res.status(400).json({
      type: 'error',
      message: 'unexpected query params, you should not pass any query params',
    });
    return;
  }
  const { subject, text } = req.params;
  if (typeof subject !== 'string') {
    res.status(400).json({
      type: 'error',
      urlFormat: '/email-alert/:subject/:text',
      message: 'expected subject to be string',
    });
    return;
  }
  if (typeof text !== 'string') {
    res.status(400).json({
      type: 'error',
      urlFormat: '/email-alert/:subject/:text',
      message: 'expected text to be string',
    });
    return;
  }
  logger(
    null,
    'EMAIL_ALERT',
    `sending alert: subject=${JSON.stringify(subject)}, text=${JSON.stringify(
      text
    )}`
  );
  enqueueAlertText(subject, text);
  res.status(200).json({
    type: 'success',
    message: 'alert queued to be sent soon',
  });
});

app.get('/help', (req, res) => {
  res.status(200).json({
    routes: {
      '/coins': {
        optionalQueryParams: {
          limit: 'number',
          offset: 'number',
          orderBy: {
            type: 'option',
            values: [
              'dailyGrade',
              'weeklyGrade',
              'monthlyGrade',
              'coinGeckoId',
            ],
          },
        },
      },
      '/grade_history/:coinGeckoId': {
        optionalQueryParams: {
          limit: 'number',
          offset: 'number',
        },
      },
      '/coin-export': {},
      '/index/kucoin/history': {},
    },
  });
});

function logger(time: number, label: string, ...args: any[]) {
  if (time == null) {
    time = Date.now();
  }
  const timeStr = new Date(time).toLocaleString();
  console.log(`[${timeStr} (${time})]`, label, ...args);
}

async function init() {
  const log = logger.bind(this, null, '[MAIN]');
  log('loading initial config');
  const initConfig = await config.read();
  log('initializing alertMail');
  alertMailInit(initConfig);

  if (!initConfig.disableDownDetector) {
    log('initializing down detector client');
    let ddName = hostname();
    if (initConfig.downDetectorName) {
      ddName = initConfig.downDetectorName;
    }
    console.log(`down detector enabled (name = ${JSON.stringify(ddName)})`);
    setIntervalDayAligned(async (time) => {
      try {
        const res = await fetch(`http://10.0.0.39:3000/clear_status/${ddName}`);
        await res.json();
      } catch (exc) {
        if (time % (1000 * 60 * 60 * 4) === 0) {
          console.log(
            '[Down Detector Client]',
            'down detector appears to be down\n',
            exc
          );
          enqueueAlertText(
            'TokenMetricsHelper Alert [Down Detector Client] [Warning]',
            'down detector appears to be down'
          );
        }
      }
    }, 30e3);
  } else {
    log('not initializing down detector client (disabled by config)');
  }
  const PORT = initConfig.port ?? 3000;
  log(`listening on port: ${PORT}`);
  server.listen(PORT);
  log('done initializing');
}

init();

if (DEBUG) {
  app.use(function (req, res, next) {
    console.log(`${req.method} ${req.url}`);
    console.log('req.query = ' + JSON.stringify(req.query, null, 2));
    console.log(`req.body = ${JSON.stringify(req.body, null, 2)}`);
    next();
  });
}
