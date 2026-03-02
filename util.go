package main

import (
	"fmt"
	"runtime"
	"time"
)

func goOS() string   { return runtime.GOOS }
func goArch() string { return runtime.GOARCH }

// retry runs fn up to maxAttempts times with exponential backoff.
// Returns the last error if all attempts fail.
func retry(maxAttempts int, baseDelay time.Duration, fn func() error) error {
	var err error
	for i := 0; i < maxAttempts; i++ {
		err = fn()
		if err == nil {
			return nil
		}
		if i < maxAttempts-1 {
			delay := baseDelay * time.Duration(1<<uint(i))
			fmt.Printf("    retry %d/%d in %s: %v\n", i+1, maxAttempts-1, delay, err)
			time.Sleep(delay)
		}
	}
	return err
}
