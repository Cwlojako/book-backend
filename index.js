const express = require('express')
const cors = require('cors')
const axios = require('axios')
const bodyParser = require("body-parser")
const app = express()
const mongoose = require('mongoose')
const Schema = mongoose.Schema
const orderSchema = new Schema({
	uuid: String, // id
	buyer: String, // 购买人
	list: Array, // 书单
	price: Number, // 总价
	profit: Number, // 利润
	deliverCount: Number, // 快递数
	isDeal: { type: Number, default: 0 }, // 是否成交 0未成交 1已成交
	remark: String, // 备注
	receiver: String, // 收货人
	receiverPhone: String, // 收货人电话
	receiverAddress: String, // 收货人地址
	createTime: { type: Date, default: Date.now },
	xgReceiverId: String, // 小谷吖收货地址id
	xgDiscountEnabled: Boolean // 小谷吖是否开启折扣
})
const xgTokenSchema = new Schema({
	uuid: String, // id
	token: String,
	name: String
})
mongoose.connect('mongodb://admin:chenweiQQ0!@39.106.72.81:27017/admin')
const Order = mongoose.model('Order', orderSchema)
const XgToken = mongoose.model('XgToken', xgTokenSchema)

const corsOptions = {
	// origin: 'http://39.106.72.81:8000'
	origin: '*'
}

app.use(cors(corsOptions))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// 保存订单
app.post('/saveOrder', async (req, res) => {
	try {
		const { uuid, buyer, list, price, deliverCount, profit } = req.body
		const order = new Order({ uuid, buyer, list, price, deliverCount, profit })
		await order.save()
		res.send({ code: 200, message: '保存成功', data: order })
	} catch(error) {
		res.status(400).send(error)
	}
})

// 更新订单
app.put('/order/:uuid', async (req, res) => {
    try {
        const order = await Order.findOneAndUpdate({ uuid: req.params.uuid }, req.body, { new: true, runValidators: true })
        if (!order) {
            return res.status(404).send()
        }
        res.send(order)
    } catch (error) {
		console.log(error)
        res.status(400).send(error)
    }
})

// 删除订单
app.delete('/order/:uuid', async (req, res) => {
    try {
        const order = await Order.deleteOne({ uuid: req.params.uuid })
        if (!order) {
            return res.status(404).send()
        }
        res.send(order)
    } catch (error) {
        res.status(500).send(error)
    }
})

// 订单是否成交
app.post('/order/deal/:uuid', async (req, res) => {
	try {
		const order = await Order.findOneAndUpdate({ uuid: req.params.uuid }, { isDeal: req.body.isDeal }, { new: true, runValidators: true })
		if (!order) {
			return res.status(404).send()
		}
		res.send(order)
	} catch (error) {
		res.status(400).send(error)
	}
})

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// 获取订单列表
app.post('/orderList', async (req, res) => {
    const { pageSize = 10, pageNo = 1, buyer, isDeal, startDate, endDate } = req.body
    const limit = parseInt(pageSize)
    const skip = (parseInt(pageNo) - 1) * limit
	const query = {}
    if (buyer) {
        // escape 出现的特殊符号
        query.buyer = new RegExp(escapeRegex(buyer), 'i')
    }
	if (isDeal !== undefined) {
		query.isDeal = isDeal
	}
	if (startDate || endDate) {
		query.createTime = {}
		if (startDate) {
			query.createTime.$gte = new Date(startDate)
		}
		if (endDate) {
			query.createTime.$lte = new Date(endDate + 'T23:59:59.999')
		}
	}
    try {
        const orders = await Order.find(query).sort({ createTime: -1 }).limit(limit).skip(skip)
        const total = await Order.countDocuments(query)
        res.send({ total, data: orders })
    } catch (error) {
		console.log(error)
        res.status(500).send(error)
    }
})

// 有路搜索
app.get('/youlu', async (req, res) => {
	const { isbn, cookie } = req.query
	const { data: html } = await axios.get(`https://www.youlu.net/search/result3/?isbn=${isbn}`, {
		headers: { cookie }
	})
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

// 有路详情
app.get('/youlu/detail', async (req, res) => {
	const { bookId } = req.query
	const { data: detail } = await axios.get(`https://www.youlu.net/info3/bookBuy.aspx?bookId=${bookId}`)
	res.send(detail)
})

// 有路加购
app.get('/youlu/addCart', async (req, res) => {
	const { bookId, buyCount, cookie } = req.query
	const { data: result } = await axios.get(`https://www.youlu.net/info3/youluBuy.aspx?bookId=${bookId}&buyCount=${buyCount}&category=old`, {
		headers: { cookie }
	})
	res.send(result)
})


// 小谷吖搜索
app.get('/xiaoguya', async (req, res) => {
	const { isbn, token } = req.query
	try {
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/product/search/searchProduct?current=1&size=20&keyword=${isbn}`, {
			headers: {
				'Authorization': `bearer ${token}`,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}
	}
})

// 小谷吖详情
app.get('/xiaoguya/detail', async (req, res) => {
	const { bookId, token } = req.query
	try {
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/product/infoById/${bookId}`, {
			headers: {
				'Authorization': `bearer ${token}`,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}
	}
})

// 小谷吖加购
app.get('/xiaoguya/addCart', async (req, res) => {
	const { specId, token, count, isbn } = req.query
	try {
		const { data: result } = await axios.post(`https://api.xiaoguya.com:9898/mall/api/mall/cart/add/${specId}/${count}`, {}, {
			headers: {
				'Authorization': `bearer ${token}`
			}
		})
		res.send(result)
	} catch(err) {
		console.log('---------------------', err)
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}else if (err.response.data?.code === 19003) {
			res.send({ code: 400, message: '该商品限购4个', data: { isbn } })
		} else {
			res.send({ code: 500, message: err.response.data.msg, data: { isbn } })
		}
	}
})

// 星辰搜索
app.get('/xc', async (req, res) => {
	const { isbn, token } = req.query
	const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linkitembook/searchList?pageNum=0&pageSize=10&condition=${isbn}&typeId=&typeId2=&isStock=0&isPriceSort=0`, {
		headers: { token: token }
	})
	res.send(result)
})

// 星辰详情
app.get('/xc/detail', async (req, res) => {
	const { bookId } = req.query
	const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linkitembook/bookCondition?bookId=${bookId}`)
	res.send(result)
})

// 星辰加购
app.get('/xc/addCart', async (req, res) => {
	const { itemId, token, num, conditionId, specificationId } = req.query
	const { data: result } = await axios.post(`https://book.xclink.cn/xc-app/linkshoppingcart/save`, {
		itemId, token, num, conditionId, specificationId
	}, {
		headers: { "Content-Type": 'application/x-www-form-urlencoded' }
	})
	if (result.message === '请登录' && result.status === 2) {
		res.send({ code: 401, message: '请设置星辰Token' })
		return
	}
	res.send(result)
})

// 孔夫子搜索
app.get('/kfz', async (req, res) => {
	const { isbn, cookie } = req.query
	const { data: result } = await axios.get(`https://search.kongfz.com/pc-gw/search-web/client/pc/product/keyword/list?dataType=0&keyword=${isbn}&page=1&size=80&sortType=7&actionPath=sortType&userArea=12001000000`, {
		headers: { cookie }
	})
	res.send(result)
})

// 孔夫子详情
app.get('/kfz/detail', async (req, res) => {
	const { shopId, itemId, cookie } = req.query
	const { data: html } = await axios.get(`https://book.kongfz.com/${shopId}/${itemId}/`, {
		headers: { cookie }
	})
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

// 孔夫子加购
app.get('/kfz/addCart', async (req, res) => {
	const { itemId, shopId, numbers, cookie } = req.query
	const { data: result } = await axios.get(`https://cart.kongfz.com/jsonp/add?&itemId=${itemId}&shopId=${shopId}&numbers=${numbers}`, {
		headers: { cookie }
	})
	if (numbers > 1) {
		const cartId = result.result.cartId + ''
		await axios.post(`https://cart.kongfz.com/cart-web/pc/v1/cart/updateCartNum`, {}, {
			params: { cartId, number: numbers },
			headers: { cookie }
		})
	}
	res.send(result)
})

//孔夫子获取cookie
app.get('/kfz/getCookie', async (req, res) => {
	const result = await axios.post(`https://login.kongfz.com/Pc/Login/account`, {
		loginName: '13202547840',
		loginPass: 'chenweiqq0'
	}, {
		headers: { "Content-Type": 'application/x-www-form-urlencoded' }
	})
	const cookie = result.headers['set-cookie'].find(f => f.startsWith('PHPSESSID')).split(';')[0]
	res.send(cookie)
})

// 孔夫子指定书店搜索
app.get('/kfz/shopSearch', async (req, res) => {
	const { isbn, cookie, shopId } = req.query
	const { data: html } = await axios.get(`https://shop.kongfz.com/${shopId}/search/?key=${isbn}`, {
		headers: { cookie }
	})
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

function getCurrentMonthRange() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() // 0-indexed

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const format = d => {
        const m = `${d.getMonth() + 1}`.padStart(2, '0')
        const day = `${d.getDate()}`.padStart(2, '0')
        return `${d.getFullYear()}-${m}-${day}`
    }

    return { startDate: format(firstDay), endDate: format(lastDay) }
}

// 孔夫子根据手机号搜索订单
app.post('/kfz/orderSearch', async (req, res) => {
	try {
		const { phone, cookie } = req.body
		const { startDate: sd, endDate: ed } = getCurrentMonthRange()
		const startDate = `${sd} 00:00:00`
		const endDate = `${ed} 23:59:59`
		const { data: result } = await axios.post(`https://order.kongfz.com/pc-gw/order-web/pc/v1/buyer/order/list`, {
			page: 1,
			size: 50,
			mobile: phone,
			startDate,
			endDate
		}, {
			headers: { cookie }
		})
		const list = result.result.list.filter(f => f.orderStatusName.indexOf('退款') === -1)
		res.send(list)
	} catch(error) {
		res.status(400).send(error)
	}
})

// 小谷吖根据收货人id筛选订单
app.post('/xgy/orderSearch', async (req, res) => {
	try {
		const { receiverId, token } = req.body
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/order/listPage?current=1&size=200&orderStatus=`, {
			headers: { 
				'Authorization': `bearer ${token}`
			}
		})
		const list = result.data.records.filter(f => f.receiverId == receiverId)
		let promises = list.map(e => {
			return axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/order/getById/${e.id}`, {
				headers: { 
					'Authorization': `bearer ${token}`
				}
			})
		})
		const details = await Promise.all(promises)
		list.forEach((e, index) => {
			e.orderDetail = details[index].data.data
		})
		res.send(list)
	} catch(error) {
		res.status(400).send(error)
	}
})

// 星辰筛选订单
app.post('/xc/orderSearch', async (req, res) => {
	try {
		const { token, phone } = req.body
		const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linktradetrade/list?pageNum=1&pageSize=100&token=${token}&status=`, {
			headers: { 
				token,
				"Content-Type": 'application/x-www-form-urlencoded'
			}
		})
		const list = result.data.list.filter(f => f.receiverMobile == phone)
		res.send(list)
	} catch (error) {
		console.log(error)
		res.status(400).send(error)
	}
})

// 旧书云筛选订单
app.post('/jsy/orderSearch', async (req, res) => {
	try {
		const { token, isbnList = [] } = req.body
		const { data: result } = await axios.get(`https://www.jiushuyunshop.com/api/collect/shop/order/list?type=&page=1&limit=30`, { headers: { authorization: token } })
		let list = result.data.data.map(m => {
			return {
				isbnList: m.item.map(m => m.goods_image.match(/978\d{10}/g)[0]),
				...m
			}
		})
		list = list.filter(f => f.isbnList.sort().join('|') === isbnList.sort().join('|'))
		let promises = list.map(e => {
			return axios.get(`https://www.jiushuyunshop.com/api/collect/shop/order/detail?id=${e.id}`, { headers: { authorization: token } })
		})
		const details = await Promise.all(promises)
		
		list.forEach((e, index) => {
			e.orderDetail = details[index].data.data
		})
		res.send(list)
	} catch (error) {
		console.log(error)
		res.status(400).send(error)
	}
})

// 旧书云搜索
app.get('/jsy', async (req, res) => {
	const { isbn } = req.query
	const { data: result } = await axios.get(`https://www.jiushuyunshop.com/api/collect/shop/list?category_id=1&keywords=${isbn}&limit=10&page=1&order=price asc`)
	res.send(result)
})

// 旧书云加购
app.get('/jsy/addCart', async (req, res) => {
	const { bookId, quantity, token } = req.query
	const { data: result } = await axios.post(`https://www.jiushuyunshop.com/api/collect/shop/car/add`, 
		{
			goods_id: bookId,
			goods_num: quantity
		},
		{
			headers: { 'Authorization': token }
		}
	)
	if (result.code === 400) {
		res.send({ code: 401, message: '请设置旧书云Token' })
		return
	}
	res.send(result)
})

// 保存小谷Token
app.post('/saveXgToken', async (req, res) => {
	try {
		const { uuid, token, name } = req.body
		const xgToken = new XgToken({ uuid, token, name })
		await xgToken.save()
		res.send({ code: 200, message: '保存成功', xgToken })
	} catch(error) {
		res.status(400).send(error)
	}
})

// 获取小谷token列表，无需分页
app.get('/xgTokenList', async (req, res) => {
	try {
		const xgTokens = await XgToken.find({})
		res.send({ data: xgTokens })
	} catch (error) {
		res.status(500).send(error)
	}
})

// 删除小谷token
app.delete('/xgToken/:uuid', async (req, res) => {
	try {
		const { uuid } = req.params
		await XgToken.deleteOne({ uuid })
		res.send({ code: 200, message: '删除成功' })
	} catch (error) {
		res.status(500).send(error)
	}
})

// 更新小谷token
app.post('/updateXgToken', async (req, res) => {
	try {
        const { uuid, token, name } = req.body
		
        const update = {}
        if (token !== undefined) update.token = token
        if (name !== undefined) update.name = name

        const xgToken = await XgToken.findOneAndUpdate({ uuid }, update, { new: true, runValidators: true })
        if (!xgToken) {
            return res.status(404).send({ code: 404, message: '未找到对应的 XgToken' })
        }
        res.send({ code: 200, message: '更新成功', xgToken })
    } catch (error) {
        res.status(400).send(error)
    }
})

// 更新小谷地址信息
app.post('/updateXgAddress', async (req, res) => {
	try {
		const { token, phone, receiverName, province, city, district, address, orderId } = req.body
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/iam/api/addr/list`, {
			headers: { 'Authorization': `bearer ${token}` }
		})
		if (result.data.length < 20) {
			await axios.post('https://api.xiaoguya.com:9898/iam/api/addr/create', {
				receiverName,
				phone,
				province,
				city,
				district,
				address,
				isDefault: false
			}, {
				headers: { 'Authorization': `bearer ${token}` }
			})
		} else {
			const firstId = result.data[0]?.id
			await axios.post(`https://api.xiaoguya.com:9898/iam/api/addr/deleteById/${firstId}`, {}, {
				headers: { 'Authorization': `bearer ${token}` }
			})
			await axios.post('https://api.xiaoguya.com:9898/iam/api/addr/create', {
				receiverName,
				phone,
				province,
				city,
				district,
				address,
				isDefault: false
			}, {
				headers: { 'Authorization': `bearer ${token}` }
			})
		}
		const { data: addrList } = await axios.get(`https://api.xiaoguya.com:9898/iam/api/addr/list`, {
			headers: { 'Authorization': `bearer ${token}` }
		})
		const xgReceiverId = addrList.data[addrList.data.length - 1]?.id
		const order = await Order.findOneAndUpdate({ uuid: orderId }, { xgReceiverId }, { new: true, runValidators: true })
		if (!order) {
            return res.status(404).send({ code: 404, message: '未找到对应的订单' })
        }
		res.send({ code: 200, message: '更新成功' })
	} catch (error) {
		console.log('error', error)
		res.status(500).send(error)
	}
})

// 更新星辰地址
app.post('/updateXcAddress', async (req, res) => {
	try {
		const { token, phone, receiverName, province, city, district, address } = req.body
		const { data: addrList } = await axios.post('https://book.xclink.cn/xc-app/linkuseraddress/List', { token }, {
			headers: { 
				token,
				"Content-Type": 'application/x-www-form-urlencoded'
			}
		})
		const id = addrList.data[addrList.data.length - 1]?.id
		await axios.post('https://book.xclink.cn/xc-app/linkuseraddress/update', {
			token,
			id,
			name: receiverName,
			phone,
			province,
			city,
			prefecture: district,
			address,
			status: 0
		}, {
			headers: {
				'Content-Type': 'application/json'
			}
		})
		res.send({ code: 200, message: '更新成功' })
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}
})

// 更新孔夫子地址
app.post('/updateKfzAddress', async (req, res) => {
	try {
		const { cookie, phone, receiverName, province, city, district, address } = req.body
		const { data: addrList } = await axios.get('https://user.kongfz.com/pc-gw/user-service/client/pc/address/list', { headers: { cookie } })
		const { data: provinceData } = await axios.get('https://user.kongfz.com/?m=User&c=Ajax&a=getTopArea', { headers: { cookie } })
		const provinceAreaId = provinceData.data.find(f => province.indexOf(f.simple) > -1)?.id ?? ''
		if (provinceAreaId) {
			const { data: cityData } = await axios.get(`https://user.kongfz.com/?m=User&c=Ajax&a=getChildrenArea&level=1&areaId=${provinceAreaId}`, { headers: { cookie } })
			const cityAreaId = cityData.data.find(f => city.indexOf(f.simple) > -1)?.id ?? ''
			if (cityAreaId) {
				const { data: districtData } = await axios.get(`https://user.kongfz.com/?m=User&c=Ajax&a=getChildrenArea&level=2&areaId=${cityAreaId}`, { headers: { cookie } })
				let areaId = districtData.data.length ? districtData.data.find(f => district.indexOf(f.simple) > -1)?.id ?? '' : cityAreaId
				const lastId = addrList.data[addrList.data.length - 1].addrId
				await axios.put(`https://user.kongfz.com/pc-gw/user-service/client/pc/address/${lastId}`, {
					address,
					area: areaId,
					isDefault: '1',
					mobile: phone,
					receiverName
				}, { headers: { cookie } })
				res.send({ code: 200, message: '更新成功' })
			} else {
				res.send({ code: 500, message: '请检查地址' })
			}
		} else {
			res.send({ code: 500, message: '请检查地址' })
		}

		
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}
})

// 更新旧书云地址
app.post('/updateJsyAddress', async (req, res) => {
	try {
		const { token, phone, receiverName, province, city, district, address } = req.body
		const { data: addrList } = await axios.get('https://www.jiushuyunshop.com/api/collect/shop/address/list?page=1&limit=100', { headers: { authorization: token } })

		if (addrList.status_code != 200) {
			res.send({ code: 500, message: addrList.message })
			return
		}
		const lastId = addrList.data[addrList.data.length - 1]?.id ?? ''
		const { data: areaList } = await axios.get('https://www.jiushuyunshop.com/api/collect/shop/address/area')
		const provinceData = areaList.data.provinceData
		const cityData = areaList.data.cityData
		const areaData = areaList.data.areaData
		let provinceId = provinceData.find(f => province.indexOf(f.label) > -1).code
		let idx = provinceData.findIndex(f => province.indexOf(f.label) > -1)
		let cityId = cityData[idx].find(f => city.indexOf(f.label) > -1).value
		let cityIdx = cityData[idx].findIndex(f => city.indexOf(f.label) > -1)
		let areaId = areaData[idx][cityIdx].find(f => district.indexOf(f.label) > -1).value
		const params = {
			address,
			area_name: district,
			area_id: areaId,
			area_text: `${province}-${city}-${district}`,
			city_name: city,
			city_id: cityId,
			province_name: province,
			province_id: provinceId,
			id: lastId,
			consignee: receiverName,
			phone,
			user_id: "3457521",
			is_default: '1'
		}
		let { data: result } = await axios.post('https://www.jiushuyunshop.com/api/collect/shop/address/save', params, { headers: { authorization: token } })
		res.send({ code: 200, message: '更新成功' })
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}
})

// 图片代理接口，解决前端 html2canvas 截图时封面图跨域问题
app.get('/img-proxy', async (req, res) => {
	const { url } = req.query
	if (!url) return res.status(400).json({ code: 400, message: '缺少 url 参数' })

	try {
		const { data, headers } = await axios.get(url, {
			responseType: 'arraybuffer',
			timeout: 15000, // 15秒超时
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		})
		res.set('Content-Type', headers['content-type'] || 'image/png')
		res.set('Cache-Control', 'public, max-age=86400') // 缓存1天
		res.send(Buffer.from(data))
	} catch (err) {
		res.status(500).json({ code: 500, message: '图片拉取失败' })
	}
})

app.listen(3000, () => {
    console.log("启动成功！")
})
