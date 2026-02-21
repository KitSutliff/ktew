package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Report tracks step execution results and produces TAP output + a Markdown report.
type Report struct {
	steps   []StepResult
	total   int
	started time.Time
	mdFile  *os.File
}

type StepResult struct {
	Index    int
	Name     string
	OK       bool
	Duration time.Duration
	Evidence string
	Err      string
}

func NewReport(total int, mdPath string) (*Report, error) {
	f, err := os.Create(mdPath)
	if err != nil {
		return nil, fmt.Errorf("create report: %w", err)
	}
	r := &Report{total: total, started: time.Now(), mdFile: f}
	r.writeHeader()
	r.tapHeader()
	return r, nil
}

func (r *Report) tapHeader() {
	fmt.Println()
	fmt.Println("  kthw — Kubernetes The Hard Way")
	fmt.Println("  " + strings.Repeat("═", 40))
	fmt.Printf("  TAP version 14\n")
	fmt.Printf("  1..%d\n", r.total)
	fmt.Println()
}

func (r *Report) writeHeader() {
	fmt.Fprintf(r.mdFile, "# Kubernetes The Hard Way — Execution Report\n\n")
	fmt.Fprintf(r.mdFile, "**Started:** %s  \n", r.started.Format(time.RFC3339))
	fmt.Fprintf(r.mdFile, "**Platform:** %s/%s  \n", goOS(), goArch())
	fmt.Fprintf(r.mdFile, "**Tool:** kthw (automated, stdlib-only Go)  \n\n")
	fmt.Fprintf(r.mdFile, "---\n\n")
}

func (r *Report) Record(idx int, name string, dur time.Duration, evidence string, err error) {
	res := StepResult{
		Index:    idx,
		Name:     name,
		OK:       err == nil,
		Duration: dur,
		Evidence: evidence,
	}
	if err != nil {
		res.Err = err.Error()
	}
	r.steps = append(r.steps, res)
	r.tapLine(res)
	r.mdSection(res)
}

func (r *Report) tapLine(s StepResult) {
	status := "ok"
	mark := "✓"
	if !s.OK {
		status = "not ok"
		mark = "✗"
	}
	durStr := formatDuration(s.Duration)
	fmt.Printf("  %s %d - %s  %s (%s)\n", status, s.Index, s.Name, mark, durStr)
	if s.Evidence != "" {
		for _, line := range strings.Split(strings.TrimRight(s.Evidence, "\n"), "\n") {
			fmt.Printf("    | %s\n", line)
		}
	}
	if s.Err != "" {
		fmt.Printf("    # error: %s\n", s.Err)
	}
	fmt.Println()
}

func (r *Report) mdSection(s StepResult) {
	status := "PASS ✓"
	if !s.OK {
		status = "FAIL ✗"
	}
	fmt.Fprintf(r.mdFile, "## Step %d: %s\n\n", s.Index, s.Name)
	fmt.Fprintf(r.mdFile, "**Status:** %s  \n", status)
	fmt.Fprintf(r.mdFile, "**Duration:** %s  \n\n", formatDuration(s.Duration))
	if s.Evidence != "" {
		fmt.Fprintf(r.mdFile, "### Verification Evidence\n\n```\n%s\n```\n\n", strings.TrimRight(s.Evidence, "\n"))
	}
	if s.Err != "" {
		fmt.Fprintf(r.mdFile, "### Error\n\n```\n%s\n```\n\n", s.Err)
	}
	fmt.Fprintf(r.mdFile, "---\n\n")
}

func (r *Report) Finalize() {
	elapsed := time.Since(r.started)
	passed := 0
	for _, s := range r.steps {
		if s.OK {
			passed++
		}
	}
	failed := len(r.steps) - passed

	fmt.Println("  " + strings.Repeat("═", 40))
	fmt.Printf("  %d/%d passed | %d failed | %s\n\n", passed, len(r.steps), failed, formatDuration(elapsed))

	fmt.Fprintf(r.mdFile, "## Summary\n\n")
	fmt.Fprintf(r.mdFile, "| | |\n|---|---|\n")
	fmt.Fprintf(r.mdFile, "| **Passed** | %d/%d |\n", passed, len(r.steps))
	fmt.Fprintf(r.mdFile, "| **Failed** | %d |\n", failed)
	fmt.Fprintf(r.mdFile, "| **Total time** | %s |\n", formatDuration(elapsed))
	fmt.Fprintf(r.mdFile, "| **Completed** | %s |\n\n", time.Now().Format(time.RFC3339))

	r.mdFile.Close()
}

func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%.1fms", float64(d.Nanoseconds())/1e6)
	}
	if d < time.Minute {
		return fmt.Sprintf("%.1fs", d.Seconds())
	}
	return fmt.Sprintf("%dm%ds", int(d.Minutes()), int(d.Seconds())%60)
}
