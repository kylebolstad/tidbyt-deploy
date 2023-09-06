// node scripts/deploy.js dotenv_config_path=.env

import axios from 'axios'
import axios_throttle from 'axios-request-throttle'
import fs from 'fs'
import * as child from 'child_process'
import 'dotenv/config'

const DEFAULT_TIDBYT_CYCLE=15

let render_parameters = []

Object.keys(process.env).slice(Object.keys(process.env).indexOf('_') + 1).forEach((key) => {
	let value = process.env[key]

	if (value?.length) {
		render_parameters.push(`${key.toLowerCase()}=${value}`)

		if (value.toLowerCase() === "true") value = true
		else if (value.toLowerCase() === "false") value = false
	}

	Object.defineProperty(global, key.toUpperCase(), {
    value,
    writable: false,
    configurable: false
  });
});

const axios_config = {
	headers: { Authorization: `Bearer ${TIDBYT_API_TOKEN}` }
}

axios_throttle.use(axios, { requestsPerSecond: eval(TIDBYT_CYCLE) || DEFAULT_TIDBYT_CYCLE })

let previous_hash = ''
let installation_exists = false;

const push = () => {

	if (PRINT_LOG) console.log(Date())

	let spawn_arguments = ['render', `${TIDBYT_APP_PATH}/${TIDBYT_APP_NAME}.star`]

	render_parameters.forEach((render_parameter) => { spawn_arguments.push(render_parameter) })

	const render_pixlet = child.spawn('pixlet', spawn_arguments)

	render_pixlet.stdout.setEncoding('utf8')
	render_pixlet.stdout.on('data', (data) => {
		if (PRINT_LOG) console.log(data)
	})

	render_pixlet.on('close', (code) => {

		const webp = `${TIDBYT_APP_PATH}/${TIDBYT_APP_NAME}.webp`

		fs.readFile(webp, 'base64', (error, data) => {

			const file_size = fs.existsSync(webp) && fs.statSync(webp).size

			if (data !== previous_hash) {
				previous_hash = data

				if (file_size) {
					axios
						.post(
							`https://api.tidbyt.com/v0/devices/${TIDBYT_DEVICE_ID}/push`,
							{
								"image": data,
								"installationID": TIDBYT_INSTALLATION_ID,
								"background": TIDBYT_BACKGROUND
							},
							axios_config
						)
						.then((response) => {
							if (PRINT_LOG) console.log(response.config.url)

							fs.existsSync(webp) && fs.unlink(webp, (error) => {
								if (error) console.error(error)
							})
						})
						.catch((error) => {
							console.error(error)
						})
				}

				else {
					axios
						.get(
							`https://api.tidbyt.com/v0/devices/${TIDBYT_DEVICE_ID}/installations`,
							axios_config
						)
						.then((response) => {
							if (PRINT_LOG) console.log(response.config.url)

							if (response.status == '200') {
								installation_exists = response.data.installations.some((installation => installation.id === TIDBYT_INSTALLATION_ID))

								if (installation_exists) {
									axios
										.delete(
											`https://api.tidbyt.com/v0/devices/${TIDBYT_DEVICE_ID}/installations/${TIDBYT_INSTALLATION_ID}`,
											axios_config
										)
										.then((response) => {
											if (PRINT_LOG) console.log(response.config.url)

											if (response.status == '200') {
												fs.existsSync(webp) && fs.unlink(webp, (error) => {
													if (error) console.error(error)
												})
												installation_exists = false;
											}
										})
										.catch((error) => {
											console.error(error)
										})
								}

							}
						})
						.catch((error) => {
							console.error(error)
						})
				}

			}

		})

	})

	render_pixlet.on('error', (error) => {
		console.error(error)
	})

}

const push_interval = setInterval(() => {
	push()
}, (eval(TIDBYT_CYCLE) || DEFAULT_TIDBYT_CYCLE) * 1000)

push()
