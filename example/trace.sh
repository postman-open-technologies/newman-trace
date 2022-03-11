#!/bin/bash

script_dir=$(dirname "$0")
newman-trace run "$script_dir/Quotable.postman_collection.json" &&
  ls -l "./newman"
