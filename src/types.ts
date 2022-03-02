import { ClientRequest, IncomingMessage } from "node:http";
import { RequestOptions } from "node:https";

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

export interface Timings {
  start: bigint;
  blocked: bigint;
  dns: bigint;
  connect: bigint;
  send: bigint;
  wait: bigint;
  receive: bigint;
  ssl: bigint;
}
