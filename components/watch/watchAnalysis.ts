// The pattern detector now lives in a server-safe shared module so the scanner
// worker and unit tests can import it too. This file re-exports it to keep
// existing client imports (`./watchAnalysis`) working unchanged.
//
// See lib/scanner/patterns.ts and docs/specs/server-side-market-scanner.md.
export * from '@/lib/scanner/patterns';
