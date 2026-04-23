class ApiFeatures {
    query;
    queryString;
    constructor(query, queryString) {
        this.query = query;
        this.queryString = queryString;
    }
    filter(allowedFields) {
        const queryObj = { ...this.queryString };
        const excludedFields = ["page", "sort", "limit", "fields", "search"];
        excludedFields.forEach((el) => delete queryObj[el]);
        Object.keys(queryObj).forEach((key) => {
            const field = key.split("[")[0];
            if (!allowedFields.includes(field))
                delete queryObj[key];
        });
        // Advanced filtering (gte, gt, lte, lt)
        let queryStr = JSON.stringify(queryObj);
        queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
        this.query = this.query.find(JSON.parse(queryStr));
        return this;
    }
    search(fields) {
        if (this.queryString.search) {
            const regex = new RegExp(this.queryString.search, "i");
            this.query = this.query.find({
                $or: fields.map((field) => ({ [field]: regex })),
            });
        }
        return this;
    }
    sort() {
        if (this.queryString.sort) {
            const sortBy = this.queryString.sort.split(",").join(" ");
            this.query = this.query.sort(sortBy);
        }
        else
            this.query = this.query.sort("-createdAt");
        return this;
    }
    limitFields() {
        if (this.queryString.fields) {
            const fields = this.queryString.fields.split(",").join(" ");
            this.query = this.query.select(fields);
        }
        return this;
    }
    paginate() {
        const page = Number(this.queryString.page) || 1;
        const limit = Number(this.queryString.limit) || 10;
        const skip = (page - 1) * limit;
        this.query = this.query.skip(skip).limit(limit);
        return this;
    }
}
export default ApiFeatures;
//# sourceMappingURL=api-features.js.map