import { ActionIcon, Group, Tooltip } from '@mantine/core';
import React from 'react';
import { EditIcon, DeleteIcon, CheckIcon, CloseIcon } from './Icons';

interface ActionButtonsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  approveLabel?: string;
  rejectLabel?: string;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  approveDisabled?: boolean;
  rejectDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Reusable action buttons group for table rows.
 * Supports edit, delete, approve, and reject actions.
 */
export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onEdit,
  onDelete,
  onApprove,
  onReject,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
  editDisabled,
  deleteDisabled,
  approveDisabled,
  rejectDisabled,
  size = 'md',
}) => {
  return (
    <Group gap="xs">
      {onApprove && (
        <Tooltip label={approveLabel} withArrow>
          <ActionIcon
            variant="light"
            color="green"
            onClick={onApprove}
            radius="md"
            size={size}
            disabled={approveDisabled}
          >
            <CheckIcon size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      {onReject && (
        <Tooltip label={rejectLabel} withArrow>
          <ActionIcon
            variant="light"
            color="orange"
            onClick={onReject}
            radius="md"
            size={size}
            disabled={rejectDisabled}
          >
            <CloseIcon size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      {onEdit && (
        <Tooltip label={editLabel} withArrow>
          <ActionIcon
            variant="light"
            color="blue"
            onClick={onEdit}
            radius="md"
            size={size}
            disabled={editDisabled}
          >
            <EditIcon size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip label={deleteLabel} withArrow>
          <ActionIcon
            variant="light"
            color="red"
            onClick={onDelete}
            radius="md"
            size={size}
            disabled={deleteDisabled}
          >
            <DeleteIcon size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
};
