'use strict';

// Usage: DATADOG_API_KEY=apikey DATADOG_APP_KEY=appkey DEBUG=* node pingtest.js host1 host2 host3

var metrics = require('datadog-metrics');
var os = require('os');
var spawn = require('child_process').spawn;
var Debug = require('debug');
var request = require('request');

metrics.init({ host: os.hostname(), prefix: 'ping.', flushIntervalSeconds: 60 });


function runPing(ip) {
	const tags = ['ping_ip:' + ip];
	const ping = spawn('ping', ['-n', '-c10', ip]);
	const debug = Debug('ping:' + ip);
	debug('starting ping');
	let output = '';
	ping.stdout.on('data', data => {
		output += data;
	});
	ping.on('close', code => {
		// 10 packets transmitted, 10 received, 0% packet loss, time 9000ms
		// rtt min/avg/max/mdev = 0.199/0.210/0.252/0.023 ms
		const stats = output.match(/(\d+) packets transmitted, (\d+) (?:packets )?received, ([\d.]+)% packet loss/);
		const rtt = output.match(/(?:round-trip|rtt) min\/avg\/max\/(?:std|m)dev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/);
		if (stats) {
			debug('stats', stats[0]);
			metrics.increment('packetsSent', +stats[1], tags);
			metrics.increment('packetsRecv', +stats[2], tags);
			metrics.gauge('lossPercent', +stats[3], tags);
		}
		if (rtt) {
			debug('rtt', rtt[0]);
			metrics.gauge('rtt.min', +rtt[1], tags);
			metrics.gauge('rtt.avg', +rtt[2], tags);
			metrics.gauge('rtt.max', +rtt[3], tags);
			metrics.gauge('rtt.stddev', +rtt[4], tags);
		}
		request.post({
			url: 'https://app.datadoghq.com/api/v1/events',
			qs: {
				api_key: process.env.DATADOG_API_KEY,
				app_key: process.env.DATADOG_APP_KEY,
			},
			json: {
				title: 'Ping for ' + ip,
				text: '%%%\n```\n' + output + '\n```\n',
				tags: tags.concat(['ping', 'host:' + os.hostname()]),
			},
		}, (err, res) => debug('sent event'));
		runPing(ip);
	});
}

process.argv.slice(2).forEach(runPing);
