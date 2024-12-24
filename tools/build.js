
const fs = require('fs');
const path = require('path');


// model-name to ModelName
function modelName(model) {

    if (model.startsWith("_")) {
        let n = model.split(".")[0].substring(1);
        return  n.split('-').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join('')
    }


    return model.split(".")[0].split('-').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join('');
}

function buildModels() {

    console.log("Building models...", __dirname);

    const modelsDir = path.join(__dirname, '../src/models');

    const models = fs.readdirSync(modelsDir);

    let _index = "";

    for (const model of models) {

        console.log("Building model:", model);

        if (model.startsWith("_")) {
            if (model === "_index.ts") {
                continue;
            } else {

                const name = modelName(model);

                _index = `
${_index}

export {
    IModel as I${name}
} from "./${model.split(".")[0]}"
                
                `

                continue;
            }
        }

        const name = modelName(model);


        _index = `
${_index}

export {
    Model as ${name},
    IModel as I${name}
} from "./${model.split(".")[0]}"
`;


    }

    fs.writeFileSync(path.join(modelsDir, "_index.ts"), _index);


}






buildModels();