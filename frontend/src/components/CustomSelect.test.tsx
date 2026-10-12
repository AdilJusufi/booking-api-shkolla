import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomSelect } from './ui'

const options = Array.from({ length: 30 }, (_, i) => ({ value: `c${i}`, label: `City ${i}` }))

function Harness() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('c0')
  return <CustomSelect label="Qyteti" options={options} value={value} onChange={setValue} open={open} onOpenChange={setOpen} />
}

describe('CustomSelect scroll handling', () => {
  it('stays open when the list itself scrolls', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /Qyteti/ }))
    const listbox = screen.getByRole('listbox')
    fireEvent.scroll(listbox)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('closes when the page scrolls', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /Qyteti/ }))
    fireEvent.scroll(window)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
