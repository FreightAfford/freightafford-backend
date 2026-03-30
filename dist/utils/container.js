export const normalizeContainers = (containers) => [
    ...new Set(containers.map((c) => c.trim().toUpperCase())),
];
export const isValidContainer = (value) => /^[A-Z]{4}\d{7}$/.test(value);
export const validateContainers = (containers) => containers.every(isValidContainer);
export const canModifyContainers = (status) => {
    const EDITABLE_STATUSES = ["awaiting_confirmation", "confirmed"];
    return EDITABLE_STATUSES.includes(status);
};
//# sourceMappingURL=container.js.map