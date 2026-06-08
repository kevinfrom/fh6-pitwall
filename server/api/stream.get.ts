export default defineEventHandler(async (event) => {
  const stream = createEventStream(event)

  const onPacket = async (packet: TelemetryPacket) => {
    await stream.push(JSON.stringify(packet))
  }

  telemetryEmitter.on('packet', onPacket)

  stream.onClosed(() => {
    telemetryEmitter.off('packet', onPacket)
  })

  return stream.send()
})

