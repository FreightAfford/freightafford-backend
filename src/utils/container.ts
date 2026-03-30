export const normalizeContainers = (containers: string[]) => [
  ...new Set(containers.map((c) => c.trim().toUpperCase())),
];

export const isValidContainer = (value: string) =>
  /^[A-Z]{4}\d{7}$/.test(value);

export const validateContainers = (containers: string[]) =>
  containers.every(isValidContainer);

export const canModifyContainers = (status: string) => {
  const EDITABLE_STATUSES = ["awaiting_confirmation", "confirmed"];
  return EDITABLE_STATUSES.includes(status);
};
