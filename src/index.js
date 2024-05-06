const { parseQuery } = require("./queryParser");
const readCSV = require("./csvReader");
function performInnerJoin(data, joinData, joinCondition, fields, table) {
    return data.flatMap((mainRow) => {
        return joinData
          .filter((joinRow) => {
            const mainValue = mainRow[joinCondition.left.split(".")[1]];
            const joinValue = joinRow[joinCondition.right.split(".")[1]];
            return mainValue === joinValue;
          })
          .map((joinRow) => {
            return fields.reduce((acc, field) => {
              const [tableName, fieldName] = field.split(".");
              acc[field] =
                tableName === table ? mainRow[fieldName] : joinRow[fieldName];
              return acc;
            }, {});
          });
      });
    }
    function performLeftJoin(data, joinData, joinCondition, fields, table) {
        return data.flatMap((mainRow) => {
          const matchingJoinRows = joinData.filter((joinRow) => {
            const mainValue = getValueFromRow(mainRow, joinCondition.left);
            const joinValue = getValueFromRow(joinRow, joinCondition.right);
            return mainValue === joinValue;
          });
          if (matchingJoinRows.length === 0) {
            return [createResultRow(mainRow, null, fields, table, true)];
          }
      
          return matchingJoinRows.map((joinRow) =>
            createResultRow(mainRow, joinRow, fields, table, true)
          );
        });
      }
      
      function getValueFromRow(row, compoundFieldName) {
        const [tableName, fieldName] = compoundFieldName.split(".");
        return row[`${tableName}.${fieldName}`] || row[fieldName];
      }
      
      function performRightJoin(data, joinData, joinCondition, fields, table) {
        const mainTableRowStructure =
    data.length > 0
      ? Object.keys(data[0]).reduce((acc, key) => {
          acc[key] = null; 
          return acc;
        }, {})
      : {};

  return joinData.map((joinRow) => {
    const mainRowMatch = data.find((mainRow) => {
      const mainValue = getValueFromRow(mainRow, joinCondition.left);
      const joinValue = getValueFromRow(joinRow, joinCondition.right);
      return mainValue === joinValue;
    });

    const mainRowToUse = mainRowMatch || mainTableRowStructure;
    return createResultRow(mainRowToUse, joinRow, fields, table, true);
  });
}

function createResultRow(
  mainRow,
  joinRow,
  fields,
  table,
  includeAllMainFields
) {
  const resultRow = {};

  if (includeAllMainFields) {
    Object.keys(mainRow || {}).forEach((key) => {
      const prefixedKey = `${table}.${key}`;
      resultRow[prefixedKey] = mainRow ? mainRow[key] : null;
    });
  }

  fields.forEach((field) => {
    const [tableName, fieldName] = field.includes(".")
      ? field.split(".")
      : [table, field];
    resultRow[field] =
      tableName === table && mainRow
        ? mainRow[fieldName]
        : joinRow
        ? joinRow[fieldName]
        : null;
  });

  return resultRow;
}
async function executeSELECTQuery(query) {
    const {
        fields,
        table,
        whereClauses,
        joinType,
        joinTable,
        joinCondition,
        groupByFields,
        hasAggregateWithoutGroupBy,
      } = parseQuery(query);
      let data = await readCSV(`${table}.csv`);
    
      if (joinTable && joinCondition) {
        const joinData = await readCSV(`${joinTable}.csv`);
        switch (joinType.toUpperCase()) {
          case "INNER":
            data = performInnerJoin(data, joinData, joinCondition, fields, table);
            break;
          case "LEFT":
            data = performLeftJoin(data, joinData, joinCondition, fields, table);
            break;
          case "RIGHT":
            data = performRightJoin(data, joinData, joinCondition, fields, table);
            break;
          default:
            throw new Error(`Unsupported JOIN type: ${joinType}`);
        }
    }
    let filteredData =
      whereClauses.length > 0
        ? data.filter((row) =>
            whereClauses.every((clause) => evaluateCondition(row, clause))
          )
        : data;
  
    let groupResults = filteredData;
    console.log({ hasAggregateWithoutGroupBy });
    if (hasAggregateWithoutGroupBy) {
      const result = {};
  
      console.log({ filteredData });
  
      fields.forEach((field) => {
        const match = /(\w+)\((\*|\w+)\)/.exec(field);
        if (match) {
          const [, aggFunc, aggField] = match;
          switch (aggFunc.toUpperCase()) {
            case "COUNT":
              result[field] = filteredData.length;
              break;
            case "SUM":
              result[field] = filteredData.reduce(
                (acc, row) => acc + parseFloat(row[aggField]),
                0
              );
              break;
            case "AVG":
              result[field] =
                filteredData.reduce(
                  (acc, row) => acc + parseFloat(row[aggField]),
                  0
                ) / filteredData.length;
              break;
            case "MIN":
              result[field] = Math.min(
                ...filteredData.map((row) => parseFloat(row[aggField]))
              );
              break;
            case "MAX":
              result[field] = Math.max(
                ...filteredData.map((row) => parseFloat(row[aggField]))
              );
              break;
          }
        }
      });
  
      return [result];
    } else if (groupByFields) {
      groupResults = applyGroupBy(filteredData, groupByFields, fields);
      return groupResults;
    } else {
      return groupResults.map((row) => {
        const selectedRow = {};
        fields.forEach((field) => {
          selectedRow[field] = row[field];
        });
        return selectedRow;
      });
    }
  }
  
  function evaluateCondition(row, clause) {
    let { field, operator, value } = clause;
  
    if (row[field] === undefined) {
      throw new Error(`Invalid field: ${field}`);
    }
  
    const rowValue = parseValue(row[field]);
    let conditionValue = parseValue(value);
  
    switch (operator) {
      case "=":
        return rowValue === conditionValue;
      case "!=":
        return rowValue !== conditionValue;
      case ">":
        return rowValue > conditionValue;
      case "<":
        return rowValue < conditionValue;
      case ">=":
        return rowValue >= conditionValue;
      case "<=":
        return rowValue <= conditionValue;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }
  
  function parseValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
  
    if (
      typeof value === "string" &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.substring(1, value.length - 1);
    }
  
    if (!isNaN(value) && value.trim() !== "") {
      return Number(value);
    }
    return value;
  }
  
  function applyGroupBy(data, groupByFields, aggregateFunctions) {
    const groupResults = {};
  
    data.forEach((row) => {
      const groupKey = groupByFields.map((field) => row[field]).join("-");
  
      if (!groupResults[groupKey]) {
        groupResults[groupKey] = { count: 0, sums: {}, mins: {}, maxes: {} };
        groupByFields.forEach(
          (field) => (groupResults[groupKey][field] = row[field])
        );
      }
  
      groupResults[groupKey].count += 1;
      aggregateFunctions.forEach((func) => {
        const match = /(\w+)\((\w+)\)/.exec(func);
        if (match) {
          const [, aggFunc, aggField] = match;
          const value = parseFloat(row[aggField]);
  
          switch (aggFunc.toUpperCase()) {
            case "SUM":
              groupResults[groupKey].sums[aggField] =
                (groupResults[groupKey].sums[aggField] || 0) + value;
              break;
            case "MIN":
              groupResults[groupKey].mins[aggField] = Math.min(
                groupResults[groupKey].mins[aggField] || value,
                value
              );
              break;
            case "MAX":
              groupResults[groupKey].maxes[aggField] = Math.max(
                groupResults[groupKey].maxes[aggField] || value,
                value
              );
              break;
          }
        }
      });
    });
  
    return Object.values(groupResults).map((group) => {
      const finalGroup = {};
      groupByFields.forEach((field) => (finalGroup[field] = group[field]));
      aggregateFunctions.forEach((func) => {
        const match = /(\w+)\((\*|\w+)\)/.exec(func);
        if (match) {
          const [, aggFunc, aggField] = match;
          switch (aggFunc.toUpperCase()) {
            case "SUM":
              finalGroup[func] = group.sums[aggField];
              break;
            case "MIN":
              finalGroup[func] = group.mins[aggField];
              break;
            case "MAX":
              finalGroup[func] = group.maxes[aggField];
              break;
            case "COUNT":
              finalGroup[func] = group.count;
              break;
          }
        }
      });
  
      return finalGroup;
    });
  }
  
  module.exports = executeSELECTQuery;