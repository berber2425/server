import { ObjectId, Sort } from "mongodb";
import { DbHelper } from "./db";

type PaginationInput = {
  cursor?: string;
  filter?: {
    [key: string]: any;
  };
  sort?: string;
  limit?: number;
};

interface CursorValue {
  _id: string;
  sortValues: Record<string, any>;
}

class Cursor {
  static encode(doc: any, sortFields: string[]): string {
    const value: CursorValue = {
      _id: doc._id.toString(),
      sortValues: sortFields.reduce(
        (acc, field) => ({
          ...acc,
          [field]: doc[field],
        }),
        {}
      ),
    };
    return Buffer.from(JSON.stringify(value)).toString("base64");
  }

  static decode(cursor: string): CursorValue {
    try {
      return JSON.parse(Buffer.from(cursor, "base64").toString());
    } catch {
      throw new Error("Invalid cursor");
    }
  }
}

async function paginate(
  collectionName: string,
  pagination: PaginationInput = {},
  options?: {
    additionalQuery?: {
      [key: string]: any;
    };
  }
): Promise<{
  pageInfo: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
  items: any[];
}> {
  if (!pagination) {
    pagination = {};
  }

  const collection = DbHelper.collection(collectionName);

  // Pagination parametreleri
  const { limit = 50, cursor, sort = "createdAt:desc" } = pagination;

  const filter = modify(pagination.filter);

  // Arama varsa ekle
  const sortPairs = sort.split(",").map((s) => s.trim().split(":"));
  const sortFields = sortPairs.map(([field]) => field);
  const sortObj: Sort = sortPairs.reduce(
    (acc, [field, direction]) => ({
      ...acc,
      [field]: direction === "desc" ? -1 : 1,
    }),
    {}
  );

  // Always add _id as final sort field
  sortObj._id = sortObj[sortFields[0]] || -1;

  // Build query
  let query: any = {
    ...options?.additionalQuery,
    ...filter,
  };

  if (cursor) {
    const decodedCursor = Cursor.decode(cursor);
    const conditions = [];

    // Build cursor conditions for each sort field
    for (let i = 0; i < sortFields.length; i++) {
      const condition: any = {};

      // Match all previous fields exactly
      for (let j = 0; j < i; j++) {
        condition[sortFields[j]] = decodedCursor.sortValues[sortFields[j]];
      }

      // Current field is greater/less than
      const currentField = sortFields[i];
      const sortDirection = sortObj[currentField];
      condition[currentField] =
        sortDirection === 1
          ? { $gt: decodedCursor.sortValues[currentField] }
          : { $lt: decodedCursor.sortValues[currentField] };

      conditions.push(condition);
    }

    conditions.push({
      _id: {
        $lt: new ObjectId(decodedCursor._id),
      },
    });

    const andConditions = conditions.length > 0 ? { $and: conditions } : {};

    if (Object.keys(query).length > 0) {
      query = {
        $and: [query, andConditions],
      };
    } else {
      query = andConditions;
    }
  }

  // Get items
  const items = await collection.find(modify(query), {
    sort: sortObj as Sort,
    limit: limit + 1,
  });

  // Check if there are more items
  const hasNextPage = items.length > limit;
  const results = hasNextPage ? items.slice(0, limit) : items;

  // Get next cursor from the last item
  const nextCursor = hasNextPage
    ? Cursor.encode(results[results.length - 1], sortFields)
    : null;

  return {
    pageInfo: {
      hasNextPage,
      nextCursor,
    },
    items: results,
  };
}

async function groupBy(
  collectionName: string,
  pagination: PaginationInput = {},
  groupFields: string[],
  options?: {
    additionalQuery?: {
      [key: string]: any;
    };
  }
): Promise<{
  pageInfo: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
  items: any[];
  groups: {
    totalCount: number;
    groups: {
      key: string;
      values: {
        value: any;
        count: number;
      }[];
    }[];
  };
}> {
  const collection = DbHelper.collection(collectionName);

  if (!pagination) {
    pagination = {};
  }

  // Pagination parametreleri
  const { limit = 50, cursor, sort = "createdAt:desc" } = pagination;

  let group: string[] = [];

  const filter = modify(pagination.filter ?? {});

  for (const f of groupFields) {
    if (!filter[f]) {
      group.push(f);
    }
  }

  const gr: {
    [key: string]: string;
  } = {};

  const facets: {
    [key: string]: any;
  } = {};

  for (const f of group) {
    gr[f] = `$${f}`;

    facets[`${f}`] = [
      {
        $group: {
          _id: `$_id.${f}`,
          count: { $sum: "$count" },
        },
      },
    ];
  }

  // Arama varsa ekle
  // Arama varsa ekle
  const sortPairs = sort.split(",").map((s) => s.trim().split(":"));
  const sortFields = sortPairs.map(([field]) => field);
  const sortObj: Sort = sortPairs.reduce(
    (acc, [field, direction]) => ({
      ...acc,
      [field]: direction === "desc" ? -1 : 1,
    }),
    {}
  );

  // Always add _id as final sort field
  sortObj._id = sortObj[sortFields[0]] || -1;

  // Build query
  let query: any = {
    ...options?.additionalQuery,
    ...filter,
  };

  let groupQuery: any = {
    ...query,
    ...options?.additionalQuery,
  };

  if (cursor) {
    const decodedCursor = Cursor.decode(cursor);
    const conditions = [];

    // Build cursor conditions for each sort field
    for (let i = 0; i < sortFields.length; i++) {
      const condition: any = {};

      // Match all previous fields exactly
      for (let j = 0; j < i; j++) {
        condition[sortFields[j]] = decodedCursor.sortValues[sortFields[j]];
      }

      // Current field is greater/less than
      const currentField = sortFields[i];
      const sortDirection = sortObj[currentField];
      condition[currentField] =
        sortDirection === 1
          ? { $gt: decodedCursor.sortValues[currentField] }
          : { $lt: decodedCursor.sortValues[currentField] };

      conditions.push(condition);
    }

    conditions.push({
      _id: {
        $lt: new ObjectId(decodedCursor._id),
      },
    });

    const andConditions = conditions.length > 0 ? { $and: conditions } : {};

    if (Object.keys(query).length > 0) {
      query = {
        $and: [query, andConditions],
      };
    } else {
      query = andConditions;
    }
  }

  const match: any = {
    ...query,
  };

  const resultsPromise = collection.aggregate([
    { $match: modify(match) },
    { $sort: sortObj },
    { $limit: limit },
  ]);

  const groupsPromise =
    Object.keys(gr).length > 0
      ? collection.aggregate([
          { $match: modify(groupQuery) },
          {
            $group: {
              _id: gr,
              count: { $sum: 1 },
            },
          },
          {
            $facet: facets,
          },
        ])
      : Promise.resolve([{}]);

  const [results, groups] = await Promise.all([resultsPromise, groupsPromise]);

  const hasNextPage = results.length > limit;
  const nextCursor = hasNextPage
    ? Cursor.encode(results[results.length - 1], sortFields)
    : null;

  const resGroups = groups[0] as any;

  const totalCount = await collection.count(modify(query));

  delete resGroups._total;

  return {
    pageInfo: {
      hasNextPage,
      nextCursor,
    },
    items: results,
    groups: {
      totalCount,
      groups: Object.keys(resGroups).map((key) => ({
        key,
        values: resGroups[key].map((v: any) => ({
          value: v._id,
          count: v.count,
        })),
      })),
    },
  };
}

function idOrString(str: any): any {
  if (typeof str !== "string") {
    return str;
  }

  if (ObjectId.isValid(str)) {
    return new ObjectId(str);
  }

  return str;
}

// check date or objectId
function modify(obj: any): any {
  if (obj === null) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(modify);
  }

  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      obj[key] = modify(obj[key]);
    }
    if (obj.id) {
      obj._id = obj.id;
      delete obj.id;
    }
  }

  if (typeof obj === "string") {
    return idOrString(obj);
  }

  return obj;
}

export { PaginationInput, Cursor, paginate, groupBy, modify };
