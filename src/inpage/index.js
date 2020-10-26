
// const { initProvider, setGlobalProvider } = require('@metamask/inpage-provider')
const { initProvider, setGlobalProvider } = require('@ezdefi/inpage-provider-forked')
const ObjectMultiplex = require('obj-multiplex')
const pump = require('pump')
const MobilePortStream = require('./MobilePortStream')
const ReactNativePostMessageStream = require('./ReactNativePostMessageStream')

const metamaskStream = new ReactNativePostMessageStream({
  name: 'inpage',
  target: 'contentscript',
})

const inpageProvider = initProvider({
  connectionStream: metamaskStream,
  shouldSendMetadata: false,
})


window.setupStreams = function () {
  // the transport-specific streams for communication between inpage and background
  const pageStream = new ReactNativePostMessageStream({
    name: 'contentscript',
    target: 'inpage',
  })

  const appStream = new MobilePortStream({
    name: 'contentscript',
  })

  // create and connect channel muxes
  // so we can handle the channels individually
  const pageMux = new ObjectMultiplex()
  pageMux.setMaxListeners(25)
  const appMux = new ObjectMultiplex()
  appMux.setMaxListeners(25)

  pump(
    pageMux,
    pageStream,
    pageMux,
    (err) => logStreamDisconnectWarning('ezDefi Inpage Multiplex', err),
  )
  pump(
    appMux,
    appStream,
    appMux,
    (err) => logStreamDisconnectWarning('ezDefi Background Multiplex', err),
  )
  // forward communication across inpage-background for these channels only
  forwardTrafficBetweenMuxes('provider', pageMux, appMux)
  forwardTrafficBetweenMuxes('publicConfig', pageMux, appMux)
}

/**
 * Set up two-way communication between muxes for a single, named channel.
 *
 * @param {string} channelName - The name of the channel.
 * @param {ObjectMultiplex} muxA - The first mux.
 * @param {ObjectMultiplex} muxB - The second mux.
 */
function forwardTrafficBetweenMuxes(channelName, muxA, muxB) {
  const channelA = muxA.createStream(channelName)
  const channelB = muxB.createStream(channelName)
  pump(
    channelA,
    channelB,
    channelA,
    (err) => logStreamDisconnectWarning(`ezDefi muxed traffic for channel "${channelName}" failed.`, err),
  )
}

/**
 * Error handler for page to extension stream disconnections
 *
 * @param {string} remoteLabel - Remote stream name
 * @param {Error} err - Stream connection error
 */
function logStreamDisconnectWarning(remoteLabel, err) {
  let warningMsg = `ezDefiContentscript - lost connection to ${remoteLabel}`
  if (err) {
    warningMsg += '\n' + err.stack
  }
  console.warn(warningMsg)
  console.error(err)
}
