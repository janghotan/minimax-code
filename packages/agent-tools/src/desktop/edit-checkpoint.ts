import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface EditCheckpoint {
  readonly filePath: string;
  readonly originalContent: string;
  readonly timestamp: number;
}

const checkpointStack: EditCheckpoint[] = [];

/**
 * Records a checkpoint of a file's state before an edit or rewrite is applied.
 */
export function recordEditCheckpoint(filePath: string, originalContent: string): void {
  checkpointStack.push({
    filePath,
    originalContent,
    timestamp: Date.now(),
  });
}

/**
 * Undoes the last file edit by restoring the most recent checkpoint.
 */
export async function undoLastEdit(
  workspaceDir?: string,
): Promise<{ success: boolean; filePath?: string; message: string }> {
  const checkpoint = checkpointStack.pop();
  if (!checkpoint) {
    return {
      success: false,
      message: 'No edit checkpoint available to undo.',
    };
  }

  try {
    const fullPath = workspaceDir ? resolve(workspaceDir, checkpoint.filePath) : checkpoint.filePath;
    await writeFile(fullPath, checkpoint.originalContent, 'utf8');
    return {
      success: true,
      filePath: checkpoint.filePath,
      message: `↩️ Reverted last edit to ${checkpoint.filePath}`,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filePath: checkpoint.filePath,
      message: `Failed to restore ${checkpoint.filePath}: ${errMessage}`,
    };
  }
}

/**
 * Returns current number of available checkpoints in stack.
 */
export function getEditCheckpointCount(): number {
  return checkpointStack.length;
}

/**
 * Clears all checkpoints (e.g. on new session or reset).
 */
export function clearEditCheckpoints(): void {
  checkpointStack.length = 0;
}
