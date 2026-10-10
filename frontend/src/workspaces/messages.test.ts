import { describe, expect, it } from 'vitest'
import { setLocale } from '../i18n/i18n.ts'
import { workspacesMessages } from './messages.tsx'
import { workspaceRoleLabel } from './workspaces.ts'

describe('workspacesMessages', () => {
  it('counts boards and members in Russian', () => {
    expect(workspacesMessages.boards(1)).toBe('1 доска')
    expect(workspacesMessages.boards(3)).toBe('3 доски')
    expect(workspacesMessages.membersCount(11)).toBe('11 участников')
    expect(workspacesMessages.workspacesLimit(1)).toBe('Можно состоять не больше чем в 1 пространстве')
  })

  it('counts boards, members and limits in English', () => {
    setLocale('en')
    expect(workspacesMessages.boards(1)).toBe('1 board')
    expect(workspacesMessages.boards(3)).toBe('3 boards')
    expect(workspacesMessages.membersLimit(1)).toBe('The workspace already has 1 member')
    expect(workspacesMessages.invitesLimit(5)).toBe('The workspace already has 5 invitations — revoke the ones you do not need')
    expect(workspaceRoleLabel('admin')).toBe('Administrator')
  })
})
