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
	createTime: { type: Date, default: Date.now }
})
mongoose.connect('mongodb://47.106.130.54:27017/book')
const Order = mongoose.model('Order', orderSchema)

const corsOptions = {
	// origin: 'http://47.106.130.54:8000'
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
		res.send({ code: 200, message: '保存成功', order })
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
        const order = await Order.findOneAndDelete(req.params.uuid)
        if (!order) {
            return res.status(404).send()
        }
        res.send(order)
    } catch (error) {
        res.status(500).send(error)
    }
})

// 获取订单列表
app.get('/orderList', async (req, res) => {
    const { pageSize = 10, pageNo = 1, buyer } = req.query
    const limit = parseInt(pageSize)
    const skip = (parseInt(pageNo) - 1) * limit
	const query = buyer ? { buyer: new RegExp(buyer, 'i') } : {}

    try {
        const orders = await Order.find(query).sort({ createTime: -1 }).limit(limit).skip(skip)
        const total = await Order.countDocuments(query)
        res.send({ total, data: orders })
    } catch (error) {
        res.status(500).send(error)
    }
})

// 有路搜索
app.get('/youlu', async (req, res) => {
	const { isbn } = req.query
	const { data: html } = await axios.get(`https://www.youlu.net/search/result3/?isbn=${isbn}`)
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
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}else if (err.response.data?.code === 19003) {
			res.send({ code: 400, message: '该商品限购4个', data: { isbn } })
		}
	}
})

// 星辰搜索
app.get('/xc', async (req, res) => {
	const { isbn } = req.query
	const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linkitembook/searchList?pageNum=0&pageSize=10&condition=${isbn}&typeId=&typeId2=&isStock=0&isPriceSort=0`)
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
	const { data: result } = await axios.get(`https://search.kongfz.com/pc-gw/search-web/client/pc/product/keyword/list?dataType=0&keyword=${isbn}&page=1&size=50&sortType=7&actionPath=sortType&userArea=12001000000`, {
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

app.listen(3000, () => {
    console.log("启动成功！")
})