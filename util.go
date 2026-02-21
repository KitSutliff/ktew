package main

import "runtime"

func goOS() string   { return runtime.GOOS }
func goArch() string { return runtime.GOARCH }
