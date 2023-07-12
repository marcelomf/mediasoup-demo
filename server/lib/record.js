/* eslint-disable no-console */
const {
	getPort,
	releasePort
} = require('./port');
const FFmpeg = require('./ffmpeg');
const GStreamer = require('./gstreamer'); 
const PROCESS_NAME = 'FFmpeg';

const _createTransport = async (transportType, router, options) => 
{
	// console.log('createTransport() [type:%s. options:%o]', transportType, options);
  
	switch (transportType) 
	{
		case 'webRtc':
			return await router.createWebRtcTransport(options);
		case 'plain':
			return await router.createPlainTransport(options);
	}
};

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
  
	const rtpTransport = await _createTransport('plain', router, rtpTransportConfig);
  
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

	// router.rtpCapabilities.codecs.reverse();
	const routerCodec = router.rtpCapabilities.codecs.find(
		(codec) => 
		{ 
			return codec.kind === producer.kind;
			// if (producer.kind == 'audio') 
			// {
			// 	return codec.kind === producer.kind;
			// }
			// else 
			// {
			// 	return codec.mimeType == 'video/H264';
			// }
		}
	);

	// router.rtpCapabilities.codecs.reverse();

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
			return new GStreamer(recordInfo);
		// eslint-disable-next-line no-fallthrough
		case 'FFmpeg':
		default:
			return new FFmpeg(recordInfo);
	}
};

const startRecord = async (peer, router) => 
{
	const recordInfo = {};

	for (const producer of peer.data.producers.values())
	{
		try 
		{
			recordInfo[producer.kind] = await publishProducerRtpStream(peer, producer, router);
		} 
		catch (e) 
		{
			console.error(e);
		}
	}
  
	recordInfo.fileName = `${peer.data.roomId}-${peer.data.idPerson}-${Date.now().toString()}`;

	if (!recordInfo.video || !recordInfo.audio) return;
	
	peer.process = getProcess(recordInfo);

	setTimeout(async () => 
	{
		for (const consumer of peer.data.consumers.values())
		{
			// eslint-disable-next-line max-len
			// Sometimes the consumer gets resumed before the GStreamer process has fully started
			// so wait a couple of seconds
			try 
			{
				await consumer.resume();
				await consumer.requestKeyFrame();
			} 
			catch (e) 
			{
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
	peer.transports = [];
	peer.producers = [];
	peer.consumers = [];  
	peer.process.kill();
	peer.process = undefined;

  
	// Release ports from port set
	for (const remotePort of peer.remotePorts) 
	{
		releasePort(remotePort);
	}
};

module.exports.stopRecord = stopRecord;
