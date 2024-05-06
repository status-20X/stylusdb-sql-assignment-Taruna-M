const {parseQuery} = require('./queryParser');
const readCSV = require('./csvReader');

function evaluateCondition(row, clause) {
    const { field, operator, value } = clause;
    switch (operator) {
        case '=': return row[field] === value;
        case '!=': return row[field] !== value;
        case '>': return row[field] > value;
        case '<': return row[field] < value;
        case '>=': return row[field] >= value;
        case '<=': return row[field] <= value;
        default: throw new Error(`Unsupported operator: ${operator}`);
    }
}
function performInnerJoin(data, joinData, joinCondition, fields, table) {
    return data.flatMap(mainRow => {
        const matchedJoinRows = joinData.filter(joinRow => {
            const mainValue = mainRow[joinCondition.left.split('.')[1]];
            const joinValue = joinRow[joinCondition.right.split('.')[1]];
            return mainValue === joinValue;
        });

        // If there are matching rows, create a row for each match
        return matchedJoinRows.map(joinRow => {
            return fields.reduce((acc, field) => {
                const [tableName, fieldName] = field.split('.');
                acc[field] = tableName === table ? mainRow[fieldName] : joinRow[fieldName];
                return acc;
            }, {});
        });
    });
}
function performLeftJoin(data, joinData, joinCondition, fields, table) {
    data = data.flatMap(mainRow => {
        const matchedJoinRows = joinData.filter(joinRow => {
            const mainValue = mainRow[joinCondition.left.split('.')[1]];
            const joinValue = joinRow[joinCondition.right.split('.')[1]];
            return mainValue === joinValue;
        });

        if (matchedJoinRows.length === 0) {
            // If there are no matching rows in the join data, create a null-padded row
            return [
                fields.reduce((acc, field) => {
                    const [tableName, fieldName] = field.split('.');
                    acc[field] = tableName === table ? mainRow[fieldName] : null;
                    return acc;
                }, {})
            ];
        }

        // If there are matching rows, create a row for each match
        return matchedJoinRows.map(joinRow => {
            return fields.reduce((acc, field) => {
                const [tableName, fieldName] = field.split('.');
                acc[field] = tableName === table ? mainRow[fieldName] : joinRow[fieldName];
                return acc;
            }, {});
        });
    });

    return data;
}

function performRightJoin(data, joinData, joinCondition, fields, table) {
    const rightJoinedData = performLeftJoin(joinData, data, {
        left: joinCondition.right,
        right: joinCondition.left
    }, fields, table);

    return rightJoinedData;
}

async function executeSELECTQuery(query) {
    const { fields, table, whereClauses,joinType, joinTable, joinCondition } = parseQuery(query);
    let data = await readCSV(`${table}.csv`);
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
            default:
                throw new Error(`Unsupported join type`);
            // Handle default case or unsupported JOIN types
        }
    }
    const filteredData = whereClauses.length > 0
    ? data.filter(row => whereClauses.every(clause => evaluateCondition(row, clause)))
    : data;

// Select the specified fields and return the result
return filteredData.map(row => {
    const selectedRow = {};
    fields.forEach(field => {
        selectedRow[field] = row[field];
    });
    return selectedRow;
});
}
module.exports = executeSELECTQuery;