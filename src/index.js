const { parseSelectQuery, parseInsertQuery, parseDeleteQuery } = require('./queryParser');
const { readCSV, writeCSV } = require('./csvReader');


function evaluateCondition(row, clause) {
    let { field, operator, value } = clause;

    value = value.replace(/["']/g, '');
    if (row[field])
        row[field] = row[field].replace(/["']/g, '');

    if (operator === 'LIKE') {
        // Transform SQL LIKE pattern to JavaScript RegExp pattern
        const regexPattern = '^' + value.replace(/%/g, '.*').replace(/_/g, '.') + '$';
        const regex = new RegExp(regexPattern, 'i'); // 'i' for case-insensitive matching


        return regex.test(row[field]);
    }

    switch (operator) {
        case '=': return row[field] == value;
        case '!=': return row[field] !== value;
        case '>': return row[field] > value;
        case '<': return row[field] < value;
        case '>=': return row[field] >= value;
        case '<=': return row[field] <= value;
        default: throw new Error(`Unsupported operator: ${operator}`);
    }
}
function performInnerJoin(data, joinData, joinCondition, fields, table) {
    // Logic for INNER JOIN
    data = data.flatMap(mainRow => {

        return joinData
            .filter(joinRow => {
                const mainValue = mainRow[joinCondition.left.split('.')[1]];
                const joinValue = joinRow[joinCondition.right.split('.')[1]];
                return mainValue === joinValue;
            })
            .map(joinRow => {
                return fields.reduce((acc, field) => {
                    const [tableName, fieldName] = field.split('.');
                    acc[field] = tableName === table ? mainRow[fieldName] : joinRow[fieldName];
                    return acc;
                }, {});
            });
    });
    return data
    // ...
}

function performLeftJoin(data, joinData, joinCondition, fields, table) {

    return data.flatMap(mainRow => {
        const matchingJoinRows = joinData.filter(joinRow => {
            const mainValue = getValueFromRow(mainRow, joinCondition.left);
            const joinValue = getValueFromRow(joinRow, joinCondition.right);
            return mainValue === joinValue;
        });
        if (matchingJoinRows.length === 0) {
            return [createResultRow(mainRow, null, fields, table, true)];
        }
        return matchingJoinRows.map(joinRow => createResultRow(mainRow, joinRow, fields, table, true));
    });
}
function getValueFromRow(row, compoundFieldName) {
    const [tableName, fieldName] = compoundFieldName.split('.');
    return row[`${tableName}.${fieldName}`] || row[fieldName];
}
function performRightJoin(data, joinData, joinCondition, fields, table) {
    // Cache the structure of a main table row (keys only)
    const mainTableRowStructure = data.length > 0 ? Object.keys(data[0]).reduce((acc, key) => {
        acc[key] = null; // Set all values to null initially
        return acc;
    }, {}) : {};
    return joinData.map(joinRow => {
        const mainRowMatch = data.find(mainRow => {
            const mainValue = getValueFromRow(mainRow, joinCondition.left);
            const joinValue = getValueFromRow(joinRow, joinCondition.right);
            return mainValue === joinValue;
        });
        // Use the cached structure if no match is found
        const mainRowToUse = mainRowMatch || mainTableRowStructure;
        // Include all necessary fields from the 'student' table
        return createResultRow(mainRowToUse, joinRow, fields, table, true);
    });
}
function createResultRow(mainRow, joinRow, fields, table, includeAllMainFields) {
    const resultRow = {};
    if (includeAllMainFields) {
        // Include all fields from the main table
        Object.keys(mainRow || {}).forEach(key => {
            const prefixedKey = `${table}.${key}`;
            resultRow[prefixedKey] = mainRow ? mainRow[key] : null;
        });
    }
    // Now, add or overwrite with the fields specified in the query
    fields.forEach(field => {
        const [tableName, fieldName] = field.includes('.') ? field.split('.') : [table, field];
        resultRow[field] = tableName === table && mainRow ? mainRow[fieldName] : joinRow ? joinRow[fieldName] : null;
    });

    return resultRow;
}
// Helper function to apply GROUP BY and aggregate functions

function applyGroupBy(data, groupByFields, aggregateFunctions) {
    // Implement logic to group data and calculate aggregates
    const groupResults = {};
    data.forEach((row) => {
        const groupKey = groupByFields.map(field => row[field]).join('-');
        if (!groupResults[groupKey]) {
            groupResults[groupKey] = { count: 0, sums: {}, mins: {}, maxes: {} };
            groupByFields.forEach(field => groupResults[groupKey][field] = row[field]);
        }


        // Aggregate calculations
        groupResults[groupKey].count += 1;
        aggregateFunctions.forEach(func => {
            const match = /(\w+)\((\w+)\)/.exec(func);
            if (match) {
                const [, aggFunc, aggField] = match;
                const value = parseFloat(row[aggField]);
                switch (aggFunc.toUpperCase()) {
                    case 'SUM':
                        groupResults[groupKey].sums[aggField] = (groupResults[groupKey].sums[aggField] || 0) + value;
                        break;
                    case 'MIN':
                        groupResults[groupKey].mins[aggField] = Math.min(groupResults[groupKey].mins[aggField] || value, value);
                        break;
                    case 'MAX':
                        groupResults[groupKey].maxes[aggField] = Math.max(groupResults[groupKey].maxes[aggField] || value, value);
                        break;
                    // Additional aggregate functions can be added here
                }
            }
        });
    });

    // Convert grouped results into an array format
    return Object.values(groupResults).map(group => {
        // Construct the final grouped object based on required fields
        const finalGroup = {};
        groupByFields.forEach(field => finalGroup[field] = group[field]);
        aggregateFunctions.forEach(func => {
            const match = /(\w+)\((\*|\w+)\)/.exec(func);
            if (match) {
                const [, aggFunc, aggField] = match;
                switch (aggFunc.toUpperCase()) {
                    case 'SUM':
                        finalGroup[func] = group.sums[aggField];
                        break;
                    case 'MIN':
                        finalGroup[func] = group.mins[aggField];
                        break;
                    case 'MAX':
                        finalGroup[func] = group.maxes[aggField];
                        break;
                    case 'COUNT':
                        finalGroup[func] = group.count;
                        break;
                    // Additional aggregate functions can be handled here
                }
            }
        });
        return finalGroup;
    });
}
function aggregatedOperations(aggregateFunction, rows) {
    const [op, fieldName] = aggregateFunction
        .split("(")
        .map((part) => part.trim().replace(")", ""));
    if (fieldName === "*") {
        return rows.length;
    }

    const values = rows.map((row) => row[fieldName]);

    let result;
    switch (op.toUpperCase()) {
        case "COUNT":
            result = values.length;
            break;
        case "AVG":
            result =
                values.reduce((acc, val) => acc + Number(val), 0) / values.length;
            break;
        case "MAX":
            result = Math.max(...values);
            break;
        case "MIN":
            result = Math.min(...values);
            break;
        case "SUM":
            result = values.reduce((acc, val) => acc + Number(val), 0);
            break;
        // Handle other aggregate functions if needed
        default:
            throw new Error(`Unsupported aggregate function: ${op}`);
    }

    return result;
}

async function executeSELECTQuery(query) {
    try {
        const { fields, table, whereClauses, joinType, joinTable, joinCondition, groupByFields, orderByFields, limit, isDistinct, hasAggregateWithoutGroupBy } = parseSelectQuery(query)

        let data = await readCSV(`${table}.csv`);

        // Perform INNER JOIN if specified
        if (joinTable && joinCondition) {
            const joinData = await readCSV(`${joinTable}.csv`);
            switch (joinType.toUpperCase()) {
                case 'INNER':
                    data = performInnerJoin(data, joinData, joinCondition, fields, table);
                    break;
                case 'LEFT':
                    data = performLeftJoin(data, joinData, joinCondition, fields, table);
                    break;
                case 'RIGHT':
                    data = performRightJoin(data, joinData, joinCondition, fields, table);
                    break;
                // Handle default case or unsupported JOIN types
            }
        }


        let filteredData = whereClauses.length > 0
            ? data.filter(row => whereClauses.every(clause => evaluateCondition(row, clause)))
            : data;

        // logic for group by
        if (groupByFields) {
            filteredData = applyGroupBy(filteredData, groupByFields, fields);
        }

        if (hasAggregateWithoutGroupBy && fields.length == 1) {
            const selectedRow = {};
            selectedRow[fields[0]] = aggregatedOperations(fields[0], filteredData);
            return [selectedRow];
        }

        // console.log("AFTER GROUP: ", filteredData);

        if (orderByFields) {
            filteredData.sort((a, b) => {
                for (let { fieldName, order } of orderByFields) {
                    if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
                    if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
                }
                return 0;
            });
        }

        // console.log("AFTER ORDER: ", filteredData);

        if (limit !== null) {
            filteredData = filteredData.slice(0, limit);
        }

        if (isDistinct) {
            filteredData = [
                ...new Map(
                    filteredData.map((item) => [
                        fields.map((field) => item[field]).join("|"),
                        item,
                    ])
                ).values(),
            ];
        }

        // Filter the fields based on the query fields
        return filteredData.map((row) => {
            const selectedRow = {};
            fields.forEach((field) => {
                if (hasAggregateWithoutGroupBy) {
                    selectedRow[field] = aggregatedOperations(field, filteredData);
                } else {
                    selectedRow[field] = row[field];
                }
            });
            return selectedRow;
        });
    } catch (error) {
        throw new Error(`Error executing query: ${error.message}`);
    }
}
async function executeINSERTQuery(query) {
    const { table, columns, values, returningColumns } = parseInsertQuery(query);
    const data = await readCSV(`${table}.csv`);


    const headers = data.length > 0 ? Object.keys(data[0]) : columns;
    const newRow = {};
    headers.forEach(header => {
        const columnIndex = columns.indexOf(header);
        if (columnIndex !== -1) {
            let value = values[columnIndex];
            if (value.startsWith("'") && value.endsWith("'")) {
                value = value.substring(1, value.length - 1);
            }
            newRow[header] = value;
        } else {
            newRow[header] = header === 'id' ? newId.toString() : '';
        }
    });

    data.push(newRow);

    await writeCSV(`${table}.csv`, data);

    let returningResult = {};
    if (returningColumns.length > 0) {
        returningColumns.forEach(column => {
            returningResult[column] = newRow[column];
        });
    }

    return {
        returning: returningResult
    };
}

async function executeDELETEQuery(query) {
    const { table, whereClause } = parseDeleteQuery(query);
    let data = await readCSV(`${table}.csv`);

    if (whereClause.length > 0) {
        data = data.filter(row => !whereClause.every(clause => evaluateCondition(row, clause)));
    } else {
        data = [];
    }

    await writeCSV(`${table}.csv`, data);

    return { message: "Rows deleted successfully." };
}

module.exports = { executeSELECTQuery, executeINSERTQuery, executeDELETEQuery };