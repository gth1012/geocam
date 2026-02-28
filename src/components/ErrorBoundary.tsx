import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0a0a0c',
          color: 'white',
          padding: '20px',
          paddingTop: '60px',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ color: '#f87171', fontSize: '24px', marginBottom: '20px' }}>
            앱 오류 발생
          </h1>
          <div style={{
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '8px', fontWeight: 'bold' }}>
              Error:
            </p>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '12px', wordBreak: 'break-all' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '8px' }}>
              Stack Trace:
            </p>
            <pre style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0
            }}>
              {this.state.error?.stack || 'No stack trace'}
            </pre>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '16px',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '8px' }}>
              Component Stack:
            </p>
            <pre style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0
            }}>
              {this.state.errorInfo?.componentStack || 'No component stack'}
            </pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '14px 28px',
              borderRadius: '12px',
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: '#4ade80',
              fontSize: '14px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            앱 새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
