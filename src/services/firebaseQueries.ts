import { getDocs, limit, query, startAfter } from 'firebase/firestore';
import type { DocumentData, Query, QueryDocumentSnapshot } from 'firebase/firestore';

// Read every page. A reporting query must never silently turn a limit into
// "the complete dataset". Snapshot cursors also handle equal sort values.
export async function getAllQueryDocs(source: Query<DocumentData>, pageSize = 200) {
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  while (true) {
    const page = await getDocs(query(source, limit(pageSize), ...(cursor ? [startAfter(cursor)] : [])));
    docs.push(...page.docs);
    if (page.size < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return { docs, size: docs.length };
}
