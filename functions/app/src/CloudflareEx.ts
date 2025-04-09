import { env } from 'cloudflare:workers'
import { Config, Effect, Layer, Logger, LogLevel } from 'effect'
import * as ConfigEx from './ConfigEx'

export const provideLoggerAndConfig = <ROut, E, RIn>(self: Layer.Layer<ROut, E, RIn>) => {
  const ConfigLive = ConfigEx.fromObject(env)
  const LogLevelLive = Config.logLevel('LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info),
    Effect.map((level) => Logger.minimumLogLevel(level)),
    Layer.unwrapEffect
  )
  return self.pipe(Layer.provide(Logger.structured), Layer.provide(LogLevelLive), Layer.provide(ConfigLive))
}
