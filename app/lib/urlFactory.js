let protooPort = 4443;

if (window.location.hostname === 'test.mediasoup.org')
	protooPort = 4444;

export function getProtooUrl({ roomId, peerId, consumerReplicas })
{
	const hostname = window.location.hostname;

	return `wss://media.apruma.com:4443/?roomId=${roomId}&peerId=${peerId}&consumerReplicas=${consumerReplicas}`;
}
