import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered instead of `children` once a descendant has thrown during render. */
  fallback: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches render/lifecycle errors thrown by any component beneath it so one
 * broken page can't blank the whole app — React only supports this via a
 * class component's static lifecycle hooks, there is no hook equivalent.
 * Takes `fallback` as a prop (rather than rendering its own UI) so the
 * fallback can use hooks like `useTranslation`, which a class component can't.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] a route crashed while rendering', error, info.componentStack)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
