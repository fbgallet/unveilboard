'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createDocument, deleteDocument } from '@/db/documents'
import { isAuthenticated } from '@/lib/session'

async function guard() {
  if (!(await isAuthenticated())) redirect('/login')
}

export async function createDocumentAction(formData: FormData) {
  await guard()
  const demo = formData.get('demo') === '1'
  const id = await createDocument(demo ? 'La liberté est-elle une illusion ?' : 'Sans titre')
  redirect(demo ? `/d/${id}?demo=1` : `/d/${id}`)
}

export async function deleteDocumentAction(formData: FormData) {
  await guard()
  await deleteDocument(String(formData.get('id')))
  revalidatePath('/')
}
