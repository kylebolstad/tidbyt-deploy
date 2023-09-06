/* eslint-disable max-nested-callbacks */
/* eslint-disable no-eval */
/* eslint-disable no-undef */
/* eslint-disable camelcase */

// node scripts/deploy.js dotenv_config_path=.env

import axios from "axios"
import axios_throttle from "axios-request-throttle"
import fs from "fs"
import * as child from "child_process"
import "dotenv/config"
import util from "util"
import ms from "ms"

const DEFAULT_TIDBYT_CYCLE = 15
const TIDBYT_CYCLE_MIN = 5

const render_parameters = []

Object.keys(process.env)
    .slice(Object.keys(process.env).indexOf("_") + 1)
    .forEach((key) => {
        let value = process.env[key]

        if (value?.length) {
            render_parameters.push(`${key.toLowerCase()}=${value}`)

            if (value.toLowerCase() === "true") {
                value = true
            } else if (value.toLowerCase() === "false") {
                value = false
            }
        }

        Object.defineProperty(global, key.toUpperCase(), {
            value,
            writable: false,
            configurable: false,
        })
    })

const tidbyt_cycle =
    Math.max(TIDBYT_CYCLE_MIN, eval(TIDBYT_CYCLE)) || DEFAULT_TIDBYT_CYCLE

const axios_config = {
    headers: { Authorization: `Bearer ${TIDBYT_API_TOKEN}` },
}

axios_throttle.use(axios, {
    requestsPerSecond: tidbyt_cycle,
})

let previous_hash = ""
let installation_exists = false

const print_log = (statement, args) => {
    if (PRINT_LOG) {
        console.log(util.format("%s", util.format(statement, args || "")))
    }
}

const deploy = () => {
    print_log("started at: %s\n", Date())

    const spawn_arguments = [
        "render",
        `${TIDBYT_APP_PATH}/${TIDBYT_APP_NAME}.star`,
    ]

    render_parameters.forEach((render_parameter) => {
        spawn_arguments.push(render_parameter)
    })

    const render_pixlet = child.spawn("pixlet", spawn_arguments)

    render_pixlet.stdout.setEncoding("utf8")
    render_pixlet.stdout.on("data", (data) => {
        print_log(data)
    })

    render_pixlet.on("close", async () => {
        const process = async () => {
            const webp = `${TIDBYT_APP_PATH}/${TIDBYT_APP_NAME}.webp`

            return new Promise((resolve, reject) => {
                fs.readFile(webp, "base64", (error, data) => {
                    const file_size =
                        fs.existsSync(webp) && fs.statSync(webp).size

                    if (data !== previous_hash) {
                        previous_hash = data

                        if (file_size) {
                            axios
                                .post(
                                    `https://api.tidbyt.com/v0/devices/${TIDBYT_DEVICE_ID}/push`,
                                    {
                                        image: data,
                                        installationID: TIDBYT_INSTALLATION_ID,
                                        background: TIDBYT_BACKGROUND,
                                    },
                                    axios_config
                                )
                                .then((response) => {
                                    print_log(response.config.url)

                                    if (fs.existsSync(webp)) {
                                        fs.unlink(webp, (error) => {
                                            if (error) {
                                                console.error(error)
                                            }
                                        })
                                    }
                                })
                                .then(() => {
                                    if (error) {
                                        reject(error)
                                    } else {
                                        resolve(data)
                                    }
                                })
                                .catch((error) => {
                                    console.error(error)
                                })
                        } else {
                            axios
                                .get(
                                    `https://api.tidbyt.com/v0/devices/${TIDBYT_DEVICE_ID}/installations`,
                                    axios_config
                                )
                                .then((response) => {
                                    print_log(response.config.url)

                                    if (response.status === "200") {
                                        installation_exists =
                                            response.data.installations.some(
                                                (installation) =>
                                                    installation.id ===
                                                    TIDBYT_INSTALLATION_ID
                                            )

                                        if (installation_exists) {
                                            axios
                                                .delete(
                                                    `https://api.tidbyt.com/v0/devices/${TIDBYT_DEVICE_ID}/installations/${TIDBYT_INSTALLATION_ID}`,
                                                    axios_config
                                                )
                                                .then((response) => {
                                                    print_log(
                                                        response.config.url
                                                    )

                                                    if (
                                                        response.status ===
                                                        "200"
                                                    ) {
                                                        if (
                                                            fs.existsSync(webp)
                                                        ) {
                                                            fs.unlink(
                                                                webp,
                                                                (error) => {
                                                                    if (error)
                                                                        console.error(
                                                                            error
                                                                        )
                                                                }
                                                            )
                                                        }

                                                        installation_exists = false
                                                    }
                                                })
                                                .catch((error) => {
                                                    console.error(error)
                                                })
                                        }
                                    }
                                })
                                .then(() => {
                                    if (error) {
                                        reject(error)
                                    } else {
                                        resolve(data)
                                    }
                                })
                                .catch((error) => {
                                    console.error(error)
                                })
                        }
                    } else if (error) {
                        reject(error)
                    } else {
                        resolve(data)
                    }
                })
            })
        }

        await process()

        print_log("\nended at: %s", Date())

        print_log(
            "\nnext deploy in %s\n",
            ms(tidbyt_cycle * 1000, { long: true })
        )
    })

    render_pixlet.on("error", (error) => {
        console.error(error)
    })
}

setInterval(() => {
    deploy()
}, tidbyt_cycle * 1000)

deploy()
