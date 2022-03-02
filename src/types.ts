import { ClientRequest, IncomingMessage } from "http";
import { RequestOptions } from "https";

export type TraceOptions = RequestOptions & {
  defaultProtocol: string;
};

export interface ProtocolModule {
  globalAgent: {
    protocol: string;
  };
  request: RequestFunc;
  get: RequestFunc;
}

export type RequestFunc = RequestFunc1 | RequestFunc2;
type RequestFunc1 = (
  options: RequestOptions | string | URL,
  callback?: (res: IncomingMessage) => void
) => ClientRequest;
type RequestFunc2 = (
  url: string | URL,
  options: RequestOptions,
  callback?: (res: IncomingMessage) => void
) => ClientRequest;
