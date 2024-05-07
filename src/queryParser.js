function parseSelectQuery(query) {
    try {
        query = query.trim();
        let isDistinct = false;
        if (query.toUpperCase().includes('SELECT DISTINCT')) {
            isDistinct = true;
            query = query.replace('SELECT DISTINCT', 'SELECT');
        }
        const limitRegex = /\sLIMIT\s(\d+)/i;
        const limitMatch = query.match(limitRegex);
        let limit = null;
        if (limitMatch) {
            limit = parseInt(limitMatch[1]);
        }
        query = query.replace(limitRegex, '');
        const orderByRegex = /\sORDER BY\s(.+)/i;
        const orderByMatch = query.match(orderByRegex);
        let orderByFields = null;
        if (orderByMatch) {
            orderByFields = orderByMatch[1].split(',').map(field => {
                const [fieldName, order] = field.trim().split(/\s+/);
                return { fieldName, order: order ? order.toUpperCase() : 'ASC' };
            });
        }

        query = query.replace(orderByRegex, '');
        const groupByRegex = /\sGROUP BY\s(.+)/i;
        const groupByMatch = query.match(groupByRegex);
        let groupByFields = null;
        if (groupByMatch) {
            groupByFields = groupByMatch[1].split(',').map(field => field.trim());
        }
        query = query.replace(groupByRegex, '');
        const whereSplit = query.split(/\sWHERE\s/i);
        const queryWithoutWhere = whereSplit[0];
        const whereClause = whereSplit.length > 1 ? whereSplit[1].trim() : null;
        const joinSplit = queryWithoutWhere.split(/\s(INNER|LEFT|RIGHT) JOIN\s/i);
        const selectPart = joinSplit[0].trim();

        const selectRegex = /^SELECT\s(.+?)\sFROM\s(.+)/i;
        const selectMatch = selectPart.match(selectRegex);

        if (!selectMatch) {
            throw new Error("Invalid SELECT format");
        }
        const [, fields, table] = selectMatch;
        const { joinType, joinTable, joinCondition } = parseJoinClause(queryWithoutWhere);

        let whereClauses = [];
        if (whereClause) {
            whereClauses = parseWhereClause(whereClause);
        }

        const aggregateFunctionRegex = /(\bCOUNT\b|\bAVG\b|\bSUM\b|\bMIN\b|\bMAX\b)\s*\(\s*(\*|\w+)\s*\)/i;
        const hasAggregateWithoutGroupBy = aggregateFunctionRegex.test(query) && !groupByFields;

        return {
            fields: fields.split(',').map(field => field.trim()),
            table: table.trim(),
            whereClauses,
            joinType,
            joinTable,
            joinCondition,
            groupByFields,
            orderByFields,
            limit,
            isDistinct,
            hasAggregateWithoutGroupBy
        };
    } catch (error) {
        throw new Error(`Query parsing error: ${error.message}`);
    }
}
function parseWhereClause(whereString) {
    const conditionRegex = /(.*?)(=|!=|>=|<=|>|<)(.*)/;
    return whereString.split(/ AND | OR /i).map(conditionString => {
        if (conditionString.includes(' LIKE ')) {
            const [field, pattern] = conditionString.split(/\sLIKE\s/i);
            return { field: field.trim(), operator: 'LIKE', value: pattern.trim().replace(/^'(.*)'$/, '$1') };
        } else {
            const match = conditionString.match(conditionRegex);
            if (match) {
                const [, field, operator, value] = match;
                return { field: field.trim(), operator, value: value.trim() };
            }
            throw new Error('Invalid WHERE clause format');
        }
    });
}
function parseJoinClause(query) {
    const joinRegex = /\s(INNER|LEFT|RIGHT) JOIN\s(.+?)\sON\s([\w.]+)\s*=\s*([\w.]+)/i;
    const joinMatch = query.match(joinRegex);
    if (joinMatch) {
        return {
            joinType: joinMatch[1].trim(),
            joinTable: joinMatch[2].trim(),
            joinCondition: {
                left: joinMatch[3].trim(),
                right: joinMatch[4].trim()
            }
        };
    }
    return {
        joinType: null,
        joinTable: null,
        joinCondition: null
    };
}
function parseInsertQuery(query) {
    query = query.replace(/"?\w+"?\."(\w+)"?/g, '$1');

    const insertRegex = /INSERT INTO "?(\w+)"?\s\(([^)]+)\)\sVALUES\s\(([^)]+)\)/i;
    const insertMatch = query.match(insertRegex);

    if (!insertMatch) {
        throw new Error("Invalid INSERT INTO syntax.");
    }

    const [, table, columns, values] = insertMatch;

    const parsedColumns = columns.split(',').map((name) => {
        return name.trim().replace(/^"?(.+?)"?$/g, '$1');
    });

    const parsedValues = values.split(',').map((value) => {
        return value.trim().replace(/^'(.*)'$/g, '$1').replace(/^"(.*)"$/g, '$1');
    });

    const returningMatch = query.match(/RETURNING\s(.+)$/i);
    const returningColumns = returningMatch
        ? returningMatch[1].split(',').map((name) => {
            return name.trim().replace(/\w+\./g, '').replace(/^"?(.+?)"?$/g, '$1');
        })
        : [];
    return {
        type: 'INSERT',
        table: table.trim().replace(/^"?(.+?)"?$/g, '$1'),
        columns: parsedColumns,
        values: parsedValues,
        returningColumns
    };
}

function parseDeleteQuery(query) {
    const deleteRegex = /DELETE FROM (\w+)( WHERE (.*))?/i;
    const deleteMatch = query.match(deleteRegex);

    if (!deleteMatch) {
        throw new Error("Invalid DELETE syntax.");
    }

    const [, table, , whereString] = deleteMatch;
    let whereClause = [];
    if (whereString) {
        whereClause = parseWhereClause(whereString);
    }

    return {
        type: 'DELETE',
        table: table.trim(),
        whereClause
    };
}


module.exports = { parseSelectQuery, parseJoinClause, parseInsertQuery, parseDeleteQuery };