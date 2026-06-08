export default defineEventHandler(async (event) => {
  const stream = createEventStream(event)

  void stream.push({
    event: 'ready',
    data: JSON.stringify({ status: 'connected' }),
  })

  const onPacket = async (packet: TelemetryPacket) => {
    await stream.push(JSON.stringify(packet))
  }

  telemetryEmitter.on('packet', onPacket)

  stream.onClosed(() => {
    telemetryEmitter.off('packet', onPacket)
  })

  return stream.send()
})
