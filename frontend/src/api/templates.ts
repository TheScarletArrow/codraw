import { request } from './http.ts'
export interface TemplateInfo { id: string; title: string; description: string; createdAt: string; updatedAt: string }
export interface SavedTemplate extends TemplateInfo { drawio: string }
export interface TemplateInput { title: string; description: string; drawio: string }
export const PERSONAL_TEMPLATES_KEY = ['personal-templates'] as const
export const fetchPersonalTemplates = (): Promise<TemplateInfo[]> => request('/api/templates')
export const fetchPersonalTemplate = (id: string): Promise<SavedTemplate> => request(`/api/templates/${encodeURIComponent(id)}`)
export const savePersonalTemplate = (input: TemplateInput, id?: string): Promise<SavedTemplate> => request(id ? `/api/templates/${encodeURIComponent(id)}` : '/api/templates', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
export const deletePersonalTemplate = (id: string): Promise<void> => request(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' })
