import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[UI] Unhandled render error:', error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="library-page animate-fade-in">
          <section className="library-section" style={{ padding: '3rem 1.25rem' }}>
            <div className="no-results shelf-empty">
              <h1 className="font-serif">Something went wrong</h1>
              <p>We hit an unexpected issue. Please retry.</p>
              <button type="button" className="btn-primary" onClick={this.handleRetry}>
                Reload app
              </button>
            </div>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
