const { Readable } = require('stream');

/**
 * Clones the given data.
 */
exports.clone = function(data, defaultValue)
{
	if (typeof data === 'undefined')
		return defaultValue;

	return JSON.parse(JSON.stringify(data));
};

// Converts a string (SDP) to a stream so it can be piped into the FFmpeg process
module.exports.convertStringToStream = (stringToConvert) => 
{
	const stream = new Readable();

	stream._read = () => {};
	stream.push(stringToConvert);
	stream.push(null);
  
	return stream;
};
  
// Gets codec information from rtpParameters
module.exports.getCodecInfoFromRtpParameters = (kind, rtpParameters) => 
{
	return {
		payloadType : rtpParameters.codecs[0].payloadType,
		codecName   : rtpParameters.codecs[0].mimeType.replace(`${kind}/`, ''),
		clockRate   : rtpParameters.codecs[0].clockRate,
		channels    : kind === 'audio' ? rtpParameters.codecs[0].channels : undefined
	};
};