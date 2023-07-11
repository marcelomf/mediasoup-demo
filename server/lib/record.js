const {
	getPort,
	releasePort
} = require('./port');
const FFmpeg = require('./ffmpeg');
  
const PROCESS_NAME = 'FFmpeg';

const createTransport = async (transportType, router, options) => 
{
	// console.log('createTransport() [type:%s. options:%o]', transportType, options);
  
	switch (transportType) 
	{
		case 'webRtc':
			return await router.createWebRtcTransport({
				listenIps          : [ { ip: '0.0.0.0', announcedIp: '149.248.20.157' } ], // TODO: Change announcedIp to your external IP or domain name
				enableUdp          : true,
				enableTcp          : true,
				preferUdp          : true,
				maxIncomingBitrate : 1500000
			});
		case 'plain':
			return await router.createPlainTransport({
				listenIp : { ip: '0.0.0.0', announcedIp: '149.248.20.157' }, // TODO: Change announcedIp to your external IP or domain name
				rtcpMux  : true,
				comedia  : false
			});
	}
};

module.exports.createTransport = createTransport;

const publishProducerRtpStream = async (peer, producer, router) => 
{
	// Create the mediasoup RTP Transport used to send media to the GStreamer process
	const rtpTransportConfig = {
		listenIp : { ip: '0.0.0.0', announcedIp: '149.248.20.157' }, // TODO: Change announcedIp to your external IP or domain name
		rtcpMux  : true,
		comedia  : false
	};
  
	// If the process is set to GStreamer set rtcpMux to false
	if (PROCESS_NAME === 'GStreamer') 
	{
		rtpTransportConfig.rtcpMux = false;
	}
  
	const rtpTransport = await createTransport('plain', router, rtpTransportConfig);
  
	// Set the receiver RTP ports
	const remoteRtpPort = await getPort();

	peer.remotePorts.push(remoteRtpPort);
  
	let remoteRtcpPort;
	// If rtpTransport rtcpMux is false also set the receiver RTCP ports

	if (!rtpTransportConfig.rtcpMux) 
	{
		remoteRtcpPort = await getPort();
		peer.remotePorts.push(remoteRtcpPort);
	}
  
	// Connect the mediasoup RTP transport to the ports used by GStreamer
	await rtpTransport.connect({
		ip       : '127.0.0.1',
		port     : remoteRtpPort,
		rtcpPort : remoteRtcpPort
	});
  
	peer.addTransport(rtpTransport);
  
	const codecs = [];
	// eslint-disable-next-line max-len
	// Codec passed to the RTP Consumer must match the codec in the Mediasoup router rtpCapabilities
	const routerCodec = router.rtpCapabilities.codecs.find(
		(codec) => codec.kind === producer.kind
	);

	codecs.push(routerCodec);
  
	const rtpCapabilities = {
		codecs,
		rtcpFeedback : []
	};
  
	// Start the consumer paused
	// Once the gstreamer process is ready to consume resume and send a keyframe
	const rtpConsumer = await rtpTransport.consume({
		producerId : producer.id,
		rtpCapabilities,
		paused     : true
	});
  
	peer.consumers.push(rtpConsumer);

	console.log("EEEEEUUUUU");

	console.log(rtpConsumer);
 
	return {
		remoteRtpPort,
		remoteRtcpPort,
		localRtcpPort : rtpTransport.rtcpTuple ? rtpTransport.rtcpTuple.localPort : undefined,
		rtpCapabilities,
		rtpParameters : rtpConsumer.rtpParameters
	};
};

// Returns process command to use (GStreamer/FFmpeg) default is FFmpeg
const getProcess = (recordInfo) => 
{
	switch (PROCESS_NAME) 
	{
		case 'GStreamer':
			// return new GStreamer(recordInfo);
		// eslint-disable-next-line no-fallthrough
		case 'FFmpeg':
		default:
			return new FFmpeg(recordInfo);
	}
};

const startRecord = async (peer, router) => 
{
	const recordInfo = {};
  
	for (const producer of peer.producers) 
	{
		try 
		{
			recordInfo[producer.kind] = await publishProducerRtpStream(peer, producer, router);
		} catch (e) 
		{
			console.error(e);
		}
	}
  
	recordInfo.fileName = Date.now().toString();

	console.log("START RECORD");
	
	console.log(recordInfo);

	if (!recordInfo.video || !recordInfo.audio) return;
	
	console.log("PROCESSS 1");
  
	peer.process = getProcess(recordInfo);

	console.log("PROCESSS 2");

	console.log(peer.process);
  
	setTimeout(async () => 
	{
		for (const consumer of peer.consumers) 
		{
			// eslint-disable-next-line max-len
			// Sometimes the consumer gets resumed before the GStreamer process has fully started
			// so wait a couple of seconds
			try {
			await consumer.resume();
			await consumer.requestKeyFrame();
			} catch(e) {
			console.error(e);
			}
		}
	}, 1000);
};

module.exports.startRecord = startRecord;

const stopRecord = async (peer) => 
{
	// console.log('handleStopRecordRequest() [data:%o]', jsonMessage);
	// const peer = peers.get(jsonMessage.sessionId);
  
	if (!peer) 
	{
		// throw new Error(`Peer with id ${jsonMessage.sessionId} was not found`);
		return;
	}
  
	if (!peer.process) 
	{
		// throw new Error(`Peer with id ${jsonMessage.sessionId} is not recording`);
		return;
	}
  
	peer.process.kill();
	console.log("MATOU PROCESSO");
	peer.process = undefined;
  
	// Release ports from port set
	for (const remotePort of peer.remotePorts) 
	{
		releasePort(remotePort);
	}
};

module.exports.stopRecord = stopRecord;
