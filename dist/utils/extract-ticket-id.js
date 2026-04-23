export const extractTicketId = (subject) => {
    if (!subject)
        return null;
    const match = subject.match(/\bFA-\d{4}-\d+\b/i);
    console.log(match);
    return match ? match[0].toUpperCase() : null;
};
//# sourceMappingURL=extract-ticket-id.js.map