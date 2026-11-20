import { useEffect, useState } from 'react'
import { useDialogFocus } from './useDialogFocus'
import type { AdvertisingGroup } from '../contract'

interface GroupEditorModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly initialGroup?: AdvertisingGroup | null
  readonly productChoices: readonly { id: string; name: string }[]
  readonly onSaveGroup: (input: {
    id?: string
    name: string
    productIds: readonly string[]
  }) => Promise<void>
}

export function GroupEditorModal({
  isOpen,
  onClose,
  initialGroup,
  productChoices,
  onSaveGroup,
}: GroupEditorModalProps) {
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const dialog = useDialogFocus(isOpen, onClose)

  useEffect(() => {
    if (initialGroup) {
      setName(initialGroup.name)
      setSelectedIds(new Set(initialGroup.productIds))
    } else {
      setName('')
      setSelectedIds(new Set())
    }
    setSearch('')
    setFormError(null)
  }, [initialGroup, isOpen])

  if (!isOpen) return null

  const filteredProducts = productChoices.filter(
    p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
  )

  const toggleProduct = (id: string) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(productChoices.map(p => p.id)))
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Please enter a group name.')
      return
    }
    if (selectedIds.size === 0) {
      setFormError('Please select at least one product for this group.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      await onSaveGroup({
        id: initialGroup?.id,
        name: name.trim(),
        productIds: Array.from(selectedIds),
      })
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save advertising group.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="adsw-modal-scrim"
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adsw-group-modal-title"
    >
      <div className="adsw-dialog-modal">
        <div className="adsw-modal-header">
          <h3 id="adsw-group-modal-title">
            {initialGroup ? 'Edit advertising group' : 'Create custom product group'}
          </h3>
          <button
            type="button"
            className="adsw-btn adsw-btn-ghost"
            onClick={onClose}
            aria-label="Close group editor"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="adsw-modal-body">
          {formError ? <div className="adsw-banner adsw-banner-error">{formError}</div> : null}

          <div className="adsw-field">
            <label className="adsw-label" htmlFor="adsw-group-name">
              Group Name *
            </label>
            <input
              id="adsw-group-name"
              type="text"
              className="adsw-input"
              placeholder="e.g. Living Room Tables, Best Sellers Q4"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="adsw-field">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 4,
              }}
            >
              <label className="adsw-label">Select Products ({selectedIds.size} selected)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="adsw-btn adsw-btn-ghost"
                  style={{ fontSize: 11, padding: 0 }}
                  onClick={selectAll}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="adsw-btn adsw-btn-ghost"
                  style={{ fontSize: 11, padding: 0 }}
                  onClick={selectNone}
                >
                  Clear
                </button>
              </div>
            </div>

            <input
              type="search"
              className="adsw-input"
              placeholder="Filter products by SKU or title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 6 }}
            />

            <div className="adsw-picker-list" role="group" aria-label="Available products">
              {filteredProducts.length === 0 ? (
                <p
                  className="adsw-cell-sub"
                  style={{ padding: 12, textAlign: 'center', margin: 0 }}
                >
                  No matching products found.
                </p>
              ) : (
                filteredProducts.map(prod => {
                  const isChecked = selectedIds.has(prod.id)
                  return (
                    <label key={prod.id} className="adsw-picker-item">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleProduct(prod.id)}
                      />
                      <span>
                        <strong>{prod.name}</strong>
                        {prod.name !== prod.id ? (
                          <span className="adsw-cell-sub">{prod.id}</span>
                        ) : null}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          <div className="adsw-modal-footer">
            <button
              type="button"
              className="adsw-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="adsw-btn adsw-btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
