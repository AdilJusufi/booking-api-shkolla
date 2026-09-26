import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScrollToTop from './ScrollToTop'

/** Butona që shtyjnë navigime nga brenda router-it, që testi të imitojë përdoruesin. */
function Controls() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate('/mjeku/1')}>push-detail</button>
      <button onClick={() => navigate('/kerko?page=2')}>push-same-path</button>
      <button onClick={() => navigate(-1)}>go-back</button>
    </>
  )
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/kerko']}>
      <ScrollToTop />
      <Controls />
      <Routes>
        <Route path="/kerko" element={<div>search</div>} />
        <Route path="/mjeku/:id" element={<div>detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScrollToTop', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollTo = vi.fn()
    // jsdom nuk e implementon scroll-in; na intereson vetëm A u thirr.
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true, configurable: true })
  })

  it('does not scroll on the initial render', () => {
    renderApp()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('scrolls to the top when the route changes', async () => {
    const user = userEvent.setup()
    const { getByText } = renderApp()
    await user.click(getByText('push-detail'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('does not scroll when only the query string changes', async () => {
    // Filtrat dhe faqosja e /kerko shkruhen te query-string — një kërcim në
    // krye për secilin do ta bënte filtrimin të padurueshëm.
    const user = userEvent.setup()
    const { getByText } = renderApp()
    await user.click(getByText('push-same-path'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not scroll on back navigation, leaving restoration to the browser', async () => {
    const user = userEvent.setup()
    const { getByText } = renderApp()
    await user.click(getByText('push-detail'))
    scrollTo.mockClear()

    await user.click(getByText('go-back'))

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
