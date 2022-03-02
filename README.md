# newman-trace

Trace Postman collection runs with [Newman](https://www.npmjs.com/package/newman) and `newman-trace`.

Traces are recorded via an exported HAR file.

Use as a drop-in replacement for `newman`.

## Install

```
npm install -g newman-trace
```

## Usage

```
Usage: newman-trace run <collection> [newman-options] [newman-trace-options]

Options:
  --no-trace              Disable tracing
  --trace-export <path>   Specify a location for the trace file
  --trace-help            Displays this message
```

By default, the HAR file will be placed in the `newman` directory.

A version of Newman is bundled with this project. To use a different version of Newman, set the executable path as the value of the `NEWMANTRACE_NEWMAN_PATH` environment variable.

## Example

```
newman-trace run Quotable.postman_collection.json --env-var url=https://quotable.apilab.io --silent
```

## License

Apache-2.0
