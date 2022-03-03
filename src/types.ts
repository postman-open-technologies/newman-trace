import { ClientRequest, IncomingMessage } from "node:http";
import { RequestOptions } from "node:https";
import { Socket } from "node:net";

export interface IExporter {
  onInstrumented(): void;
  createInterceptor(method: string, url: URL, timing: bigint): IInterceptor;
  export(): void;
}

export interface IInterceptor {
  onComplete(): void;
  onRequestCall(req: ClientRequest, timing: bigint): void;
  onRequestFinish(req: ClientRequest, body: Buffer, timing: bigint): void;
  onRequestFirstByte(timing: bigint): void;
  onResponseEnd(res: IncomingMessage, body: Buffer, timing: bigint): void;
  onResponseFirstByte(timing: bigint): void;
  onResponseReceived(res: IncomingMessage, timing: bigint): void;
  onSecureConnect(socket: Socket, timing: bigint): void;
  onSocketConnect(socket: Socket, timing: bigint): void;
  onSocketCreate(socket: Socket, timing: bigint): void;
  onDNSLookup(address: string, timing: bigint): void;
}

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
