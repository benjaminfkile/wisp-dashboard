import { useMemo } from 'react'
import { useSettings } from './useSettings'
import * as wisp from '../wisp/client'
import type {
  ContractStatusResponse,
  CreateContractRequest,
  CreateContractResponse,
  ExecResponse,
  ImagesResponse,
  PublishEventRequest,
} from '../wisp/types'

/**
 * A wisp client bound to the current app token from `useSettings`. The app
 * token is applied automatically to `createContract`, `publishEvent`, and
 * `eventsWsUrl`; per-contract tokens are still passed per call.
 */
export interface WispClient {
  health(): Promise<boolean>
  getImages(): Promise<ImagesResponse>
  createContract(req: CreateContractRequest): Promise<CreateContractResponse>
  getContract(id: string): Promise<ContractStatusResponse>
  deleteContract(id: string): Promise<ContractStatusResponse>
  execSync(
    id: string,
    contractToken: string,
    command: string,
  ): Promise<ExecResponse>
  publishEvent(req: PublishEventRequest): Promise<void>
  execStreamPath(id: string): string
  shellWsUrl(id: string, contractToken: string): string
  eventsWsUrl(types?: string[]): string
}

/** Returns wisp client methods with the current app token pre-applied. */
export function useWispClient(): WispClient {
  const { appToken } = useSettings()

  return useMemo<WispClient>(
    () => ({
      health: wisp.health,
      getImages: wisp.getImages,
      createContract: (req) => wisp.createContract(req, appToken || undefined),
      getContract: wisp.getContract,
      deleteContract: wisp.deleteContract,
      execSync: wisp.execSync,
      publishEvent: (req) => wisp.publishEvent(req, appToken || undefined),
      execStreamPath: wisp.execStreamPath,
      shellWsUrl: wisp.shellWsUrl,
      eventsWsUrl: (types) => wisp.eventsWsUrl(appToken || undefined, types),
    }),
    [appToken],
  )
}
