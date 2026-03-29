// ---------- 內部變數 ----------

/** 拖入網頁中的檔案陣列 */
let drapedFiles = []

/** 圖片陣列 */
let imageList = [];

/** 預計載入的圖片總數量 */
let loadingImageCount = 0;

/** 已載入的圖片數量 */
let loadedImageCount = 0;

/** 「圖片陣列」的寫入索引值 (代表陣列中下一個空白的 Index) */
let imageLoadIndex = 0;

/** 目前顯示圖片的索引 */
let imageShowIndex = 0;

// ---------- 內部判斷 ----------

/* 版面是否為雙圖模式*/
let isDualContainer = false;

/** 額外的容器是否已顯示圖片 */
let isAnotherContainerActivated = false;

/** 載入新圖片時是否保留陣列中已存在的圖片 */
let isKeepImageList = false;

/** 是否按住滑鼠左鍵 */
let isPressMouseRightKey = false;

/** 是否顯示完整圖片 */
let isShowFullImage = false;

/** 是否降低圖片移動速度 */
let isSlowShiftMode = false;

/** 是否為圖片垂直移動模式 */
let isVerticalShiftMode = false;

/** 是否為圖片縮放模式 */
let isZoonInMode = false;

// ---------- 元素抓取 ----------

// 圖片顯示
/** wallpaperImg (圖片顯示區域) 群組 */
const wallpaperImgGroup = document.querySelectorAll('.wallpaperImg');
/** imageContainer (圖片顯示容器) 群組 */
const imageContainerGroup = document.querySelectorAll('.imageContainer');
/** 存放圖片的容器 */
const container = document.getElementById('container');

// 版面控制按鈕
const layoutBtn_copyToRightContainer = document.getElementById('layoutBtn_copyToRightContainer');
const layoutBtn_clearRightImg = document.getElementById('layoutBtn_clearRightImg');

// 圖片資訊顯示
const imgText_current = document.getElementById('imgText_current');
const imgText_total = document.getElementById('imgText_total');
const imgText_imgName = document.getElementById('imgText_imgName');
const imgText_resWidth = document.getElementById('imgText_resWidth');
const imgText_resHeight = document.getElementById('imgText_resHeight');
const imgText_rating = document.getElementById('imgText_rating');
const imgText_status = document.getElementById('imgText_status');

// 檔案列表
const fileList = document.getElementById('fileList');
const fileIDList = document.getElementById('filteredFileIDList');
const filteredFileCounter = document.getElementById('filteredFileCounter')

// 參考線
const guideLineGroup = document.querySelectorAll(".guideLine");
const guideLineButtonGroup = document.querySelectorAll(".guideLineBtn");

// 功能面板群組
const functionPanelGroup = document.getElementById("functionPanel")
const fpFunctionControl = document.getElementById('functionControl')
const fpImageControl = document.getElementById('functionControl')

// 其他
/** 圖片移動狀態指示 */
let mouseControlIndicator = document.getElementById('mouseControlIndicator');

/** 比例自動調整功能狀態提示 */
let oneClickFeatureIndicator = document.getElementById('oneClickFeatureIndicator');

/** 單點切換至下一張圖片 */
let oneClickFeature = false

const functionPanelTitle = document.getElementById('functionPanel-title')


// ---------- 圖片載入 ----------

/**
 * worker 初步處理圖片
 * @brief 對每張圖片新增圖片索引值、檔案名稱、檔案 URL 等屬性
 */
const fileProcessWorker = `
self.onmessage = async (e) => {
    const { file, index } = e.data;
    try {
        const imgPromise = self.createImageBitmap(file);

        const dataURLPromise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });

        const [img, dataURL] = await Promise.all([imgPromise, dataURLPromise]);

        self.postMessage({
            index: index,
            fileName: file.name,
            fileURL: dataURL,
            rating: 0,
            status: 0,
            width: img.width,
            height: img.height,
            shiftX: 0,
            shiftY: 0,
            zoomRatio: 0
        });
    } catch (error) {
        console.error("worker 處理錯誤: " + error);
        self.postMessage({
            index: index,
            file: file.name,
            error: error.message
        });
    }
};`;

const fileProcessBlob = new Blob([fileProcessWorker], { type: 'application/javascript' });
const worker = new Worker(URL.createObjectURL(fileProcessBlob));

/**
 * 處理拖曳進入讀取區域的圖片
 * @param {data} event 拖曳的檔案
 */
function imageLoader(event) {
    event.preventDefault();
    if (!isKeepImageList) {
        imageList.length = 0; // 重設圖片陣列
        imageLoadIndex = 0; // 重設圖片寫入索引值
        loadedImageCount = 0 // 重設已載入的圖片數量
    }
    const dataTransfer = event.dataTransfer.files
    if (dataTransfer.length) {
        const filesList = Array.from(dataTransfer)
        if (!filesList[0].type.includes("image/")) {
            console.error("The file you drapped is not a image.")
            alert("你拖入的檔案不是圖片")
        } else {
            imgText_total.innerHTML = "載入中";
            drapedFiles = []
            filesList.map((data, index) => {
                if (data.type.includes('image/')) {
                    drapedFiles.push(data)
                } else {
                    console.error(`File no. ${index + 1} (name: ${data.name}) is not a image.`)
                }
            })
        }
    }
    loadingImageCount = drapedFiles.length;
    for (let file of drapedFiles) {
        if (file.type.startsWith('image/')) {
            worker.postMessage({ file, index: imageLoadIndex }); // 傳送資料 (圖片及編號) 給 worker
        }
        imageLoadIndex++;
    }
}

/**
 * worker 第二次處理圖片
 * @brief 將圖片存進 imageList 陣列中
 */
worker.onmessage = (e) => {
    if (e.data.error) {
        console.error(`第 ${e.data.index + 1} 張圖片 (檔名: ${e.data.file}) 載入失敗: message: ${e.data.error}`);
        return;
    }
    const { index, fileName, fileURL, rating, status, width, height, shiftX, shiftY, zoomRatio } = e.data;
    const imageStatus = [ "original", "positionChanged", "needCrop", "needEdit", "discard" ];
    imageList[index] = {
        index,
        fileName,
        fileURL,
        rating,
        get status()
        {
            return imageStatus[this._status];
        },
        set status(value)
        {
            this._status = value;
        },
        _status: 0,
        width,
        height,
        shiftX,
        shiftY,
        zoomRatio: 100
    };
    loadedImageCount++;
    if (loadedImageCount == loadingImageCount) {
        imgText_total.innerHTML = imageList.length;
        showImage('init');
        imageFilter('init');
    }
};

// ---------- 圖片顯示 ---------

/**
 * 顯示圖片
 * @param type 載入圖片的方式
 */
function showImage(type)
{
    if (imageList.length) {
        if (typeof(type) == 'string')
        {
            switch (type) {
                case 'init':
                    imageShowIndex = 0;
                    if (imageList[imageShowIndex]) {
                        wallpaperImgGroup[0].src = imageList[imageShowIndex].fileURL;
                        loadImageInfo("full");
                        imgShowAdjustment();
                        imgPositionChanger("init");
                    }
                    break;
                case 'last':
                    imageShowIndex > 0 ? imageShowIndex-- : imageShowIndex = (imageList.length - 1);
                    wallpaperImgGroup[0].src = imageList[imageShowIndex].fileURL;
                    loadImageInfo("full");
                    imgShowAdjustment();
                    imgPositionChanger("restore");
                    break;
                case 'next':
                    imageShowIndex < (imageList.length - 1) ? imageShowIndex++ : imageShowIndex = 0;
                    wallpaperImgGroup[0].src = imageList[imageShowIndex].fileURL;
                    loadImageInfo("full");
                    imgShowAdjustment();
                    imgPositionChanger("restore");
                    break;
                case 'empty':
                    wallpaperImgGroup[0].src = "";
                    break;
                default:
                    alert("參數設定錯誤 (目前為: " + type + ")");
                    break;
            }
        }
        else if (typeof(type) == 'number')
        {
            if (type < imageList.length) {
                imageShowIndex = type;
                wallpaperImgGroup[0].src = imageList[imageShowIndex].fileURL;
                loadImageInfo("full");
                imgShowAdjustment();
                imgPositionChanger("restore");
            } else {
                alert(`載入的數值 (${type}) 大於或等於 imageList 的數量 (${imageList.length})`);
            }
        }
    }
    else {
        alert("圖片未載入");
    }
}

/**
 * 根據圖片比例自動調整圖片對齊方式
 * @param {String} type 功能切換 (work = 預設值, return = 返回結果)
 */
function imgShowAdjustment(type = "work")
{
    switch (type) {
        case "work":
            if (imageList[imageShowIndex].width*2.2 < imageList[imageShowIndex].height) {
                wallpaperImgGroup[0].style.maxWidth = "unset";
                wallpaperImgGroup[0].style.height = "auto";
                wallpaperImgGroup[0].style.width = "100%";
                wallpaperImgGroup[0].style.minHeight = "100vh";
            } else {
                wallpaperImgGroup[0].style.maxWidth = "none";
                wallpaperImgGroup[0].style.height = "100%";
                wallpaperImgGroup[0].style.width = "auto";
                wallpaperImgGroup[0].style.minHeight = "unset";
            }
            break;
        case "return":
            if (imageList[imageShowIndex].width*2.2 < imageList[imageShowIndex].height) {
                return true;
            } else {
                return false;
            }
            break;
        default:
            console.log("imgShowAdjustment function doesn't work");
            wallpaperImgGroup[0].style.maxWidth = "unset";
            wallpaperImgGroup[0].style.height = "auto";
            wallpaperImgGroup[0].style.width = "100%";
            wallpaperImgGroup[0].style.minHeight = "100vh";
            break;
    }
}

function imgPositionChanger(type)
{
    switch (type) {
        case "init":
            wallpaperImgGroup[0].style.left = "0px";
            wallpaperImgGroup[0].style.top = "0px";
            break;
        case "restore":
            if (imageList[imageShowIndex].status == "original") {
                wallpaperImgGroup[0].style.left = `${imageList[imageShowIndex].shiftX}px`;
                console.log(`${imageList[imageShowIndex].shiftX}`);
                wallpaperImgGroup[0].style.top = `${imageList[imageShowIndex].shiftY}px`;
                if (imgShowAdjustment("return")) {
                    wallpaperImgGroup[0].style.width = `${imageList[imageShowIndex].zoomRatio}%`
                } else {
                    wallpaperImgGroup[0].style.height = `${imageList[imageShowIndex].zoomRatio}%`
                }
            } else {
                wallpaperImgGroup[0].style.left = "0px";
                wallpaperImgGroup[0].style.top = "0px";
                if (imgShowAdjustment("return")) {
                    wallpaperImgGroup[0].style.width = "100%";
                } else {
                    wallpaperImgGroup[0].style.height = "100%";
                }
            }
            break;
        case "copy":
            wallpaperImgGroup[1].style.left = `${imageList[imageShowIndex].shiftX}px`;
            wallpaperImgGroup[1].style.top = `${imageList[imageShowIndex].shiftY}px`;
            if (imgShowAdjustment("return")) {
                wallpaperImgGroup[1].style.width = `${imageList[imageShowIndex].zoomRatio}%`
            } else {
                wallpaperImgGroup[1].style.height = `${imageList[imageShowIndex].zoomRatio}%`
            }
            break;
        default:
            console.error(`imgPositionChanger 設定錯誤 (type: ${type})`);
            break;
    }
}

// ---------- 圖片資訊 ---------

/**
 * 載入圖片資訊
 * @param {String} type init 清除, info 圖片資訊
 * @param {Object} img 圖片
 */
function loadImageInfo(type)
{
    switch (type) {
        case "init":
            imgText_current.innerHTML = "0";
            imgText_total.innerHTML = "0";
            imgText_imgName.innerHTML = "";
            imgText_resWidth.innerHTML = "0";
            imgText_resHeight.innerHTML = "0";
            imgText_rating.innerHTML = "0";
            imgText_status.innerHTML = "無";
            break;
        case "full":
            imgText_current.innerHTML = imageShowIndex + 1;
            imgText_total.innerHTML = imageList.length;
            imgText_imgName.innerHTML = imageList[imageShowIndex].fileName;
            imgText_resWidth.innerHTML = imageList[imageShowIndex].width;
            imgText_resHeight.innerHTML = imageList[imageShowIndex].height;
            imgText_rating.innerHTML = imageList[imageShowIndex].rating;
            imgText_status.innerHTML = imageList[imageShowIndex].status;
            break;
        case "basic":
            imgText_imgName.innerHTML = imageList[imageShowIndex].fileName;
            imgText_resWidth.innerHTML = imageList[imageShowIndex].width;
            imgText_resHeight.innerHTML = imageList[imageShowIndex].height;
            imgText_rating.innerHTML = imageList[imageShowIndex].rating;
            imgText_status.innerHTML = imageList[imageShowIndex].status;
            break;
        case "rating":
            imgText_rating.innerHTML = imageList[imageShowIndex].rating;
            break;
        case "status":
            imgText_status.innerHTML = imageList[imageShowIndex].status;
            break;
        default:
            alert(`值 ${type} 未設定`);
            break;
    }
}

// ---------- 雙圖顯示 ---------

/**
 * 啟用或停用雙圖版面
 * @param status 啟用 (true) 或停用 (false)
 */
function dualViewToggle(activeBtn)
{
    isDualContainer = !isDualContainer ? true : false;
    if(isDualContainer)
    {
        container.style.setProperty('grid-template-columns', "1fr auto 0.25fr auto 1fr", "important");
        activeBtn.innerHTML = "關閉";
        layoutBtn_copyToRightContainer.disabled = false;
    }
    else
    {
        container.style.gridTemplateColumns = "1fr auto 1fr";
        activeBtn.innerHTML = "開啟";
        layoutBtn_copyToRightContainer.disabled = true;
    }
}

/**
 * 複製左側圖片至右側圖片容器
 */
function copyImageToRightContainer()
{
    const imageSrc = wallpaperImgGroup[0].getAttribute('src');

    if(isDualContainer && imageSrc) {
        wallpaperImgGroup[1].src = imageList[imageShowIndex].fileURL;
        imgPositionChanger("copy");
    } else if (!isDualContainer) {
        alert("未啟用雙圖檢視");
    } else {
        alert("未載入圖片");
    }
}

/**
 * 清除額外容器的圖片
 */
function clearRightImg()
{
    if (isDualContainer) {
        wallpaperImgGroup[1].src = "";
    } else {
        alert("未啟用雙圖檢視");
    }
}

// ---------- 圖片刪除 ---------

/**
 * 清除陣列中所有圖片
 * @param {Array} targetArray 目標陣列
 */
function removeAllImages(targetArray) {
    if(targetArray.length)
    {
        targetArray.length = 0;
        wallpaperImgGroup[0].src = "";
        loadImageInfo("init");
        console.log(`remove all image successfully (targetArray: ${Object.keys({targetArray})[0]})`);
    }
    else
    {
        console.log(`remove all image failed (targetArray: ${Object.keys({targetArray})[0]})`);
    }
}

/**
 * 移除指定陣列中的指定圖片並傳回該圖片
 * @param {Array} targetArray 
 * @param {Number} targetIndex 
 */
function removeImageAtIndex(targetArray, targetIndex)
{
    if (targetIndex >= 0 && targetIndex < targetArray.length) {
        return targetArray.splice(targetIndex, 1)[0];
    } else {
        return undefined;
    }
}

/**
 * 移除特定圖片後的圖片顯示
 * @param {Array} targetArray 圖片所在陣列
 * @param {Number} targetIndex 圖片索引值
 */
function removeSpecificImage(targetArray, targetIndex)
{
    const removedImage = removeImageAtIndex(targetArray, targetIndex);
    if (removedImage != undefined) {
        imageShowIndex == 0 ? imageShowIndex = 0 : imageShowIndex--;
        imageList.length <= 0 ? showImage('empty') : showImage(imageShowIndex);
        showImage(imageShowIndex);
        
        console.log(`remove ${Object.keys({targetArray})[0]}[${targetIndex}] successfully`);
    } else {
        console.log(`remove failed (targetArray: ${Object.keys({targetArray})[0]}, targetIndex: ${targetIndex})`);
    }
}

// ---------- 介面控制 ---------

/**
 * 使用按鈕啟用或停用雙圖檢視功能
 * @param {Object} triggeredBtn 觸發此 Function 的按鈕
 */
function clearBtnSwitch(triggeredBtn)
{
    const imageSrc = wallpaperImgGroup[0].getAttribute('src');
    if (triggeredBtn.id == "layoutBtn_copyToRightContainer") {
        if (!isAnotherContainerActivated && imageSrc) {
            isAnotherContainerActivated = true;
            layoutBtn_clearRightImg.disabled = false;
        }
    } else if (triggeredBtn.id == "layoutBtn_clearRightImg") {
        if (isAnotherContainerActivated) {
            isAnotherContainerActivated = false;
            layoutBtn_clearRightImg.disabled = true;
        }
    }
}

/**
 * 清除所有圖片
 */
function clearAllImg()
{
    if (!imageList.length) {
        alert("尚未載入圖片")
    } else if (confirm("確定要刪除所有照片嗎？")) {
        removeAllImages(imageList);
        imageFilter("init")
    }
}

/**
 * 清除目前圖片
 * @param {Boolean} needConfirm 是否需要確認
 */
function clearCurrentImg()
{
    if (!imageList.length) {
        alert("尚未載入圖片")
    } else if (confirm("確定要刪除目前照片嗎？")) {
        if (imageList.length === 1) {
            removeAllImages(imageList);
            imageFilter("init")
        } else {
            removeSpecificImage(imageList, imageShowIndex);
            updateFileList()
            imageFilter("init")
        }
    } 
}
/**
 * 參考線顯示切換
 * @param {String} type 顯示類型 (disp: 顯示或隱藏, closeOnly: 僅隱藏)
 * @param {Element} triggeredBtn 觸發此 function 的按鈕
 */
function guideLineToggle(type, triggeredBtn = undefined)
{
    if (!isShowFullImage && type == "disp") {
        switch (triggeredBtn.id) {
            case "guideLineBtn_typeA":
                guideLineGroup[0].classList.toggle("displayForce");
                triggeredBtn.classList.toggle("btnActive");
                break;
            case "guideLineBtn_typeB":
                guideLineGroup[1].classList.toggle("displayForce");
                triggeredBtn.classList.toggle("btnActive");
                break;
            case "guideLineBtn_typeC":
                guideLineGroup[2].classList.toggle("displayForce");
                triggeredBtn.classList.toggle("btnActive");
                break;
            case "guideLineBtn_typeD":
                guideLineGroup[3].classList.toggle("displayForce");
                triggeredBtn.classList.toggle("btnActive");
                break;
            case "guideLineBtn_closeAll":
                guideLineGroup.forEach((guideLine) => {
                    if (guideLine.classList.contains('displayForce')) {
                        guideLine.classList.toggle('displayForce');
                    }
                });
                break;
            default:
                console.error(`觸發此 function 的按鈕 ID 未設定或在範圍外 (triggeredBtn.id: ${triggeredBtn.id ? triggeredBtn.id : "未設定"})`);
                break;
        }
    } else if (type == "close") {
        guideLineGroup.forEach((guideLine) => {
            if (guideLine.classList.contains('displayForce')) {
                guideLine.classList.toggle('displayForce');
            }
        });
        guideLineButtonGroup.forEach((guideLineBtn) => {
            if (guideLineBtn.classList.contains('btnActive')) {
                guideLineBtn.classList.toggle('btnActive');
            }
        });
    }
}

function minimalPanel() {
    functionPanelGroup.classList.toggle('max-w-30')
    functionPanelGroup.classList.toggle('h-[70%]')
    functionPanelGroup.classList.toggle('overflow-x-hidden')
    functionPanelGroup.classList.toggle('overflow-y-hidden')
}

/**
 * 顯示檔案列表
 */
function loadFileList()
{
    imageList.forEach(element => {
        fileList.innerHTML += `<option id="fileList_content" value=${element.index}> ${element.index + 1}. ${element.fileName} </option>`;
    });
}

/**
 * 檔案列表顯示
 * @param {String} type 顯示類型
 */
function imageFilter(type)
{
    switch (type) {
        case "init":
            fileList.innerHTML = "";
            fileIDList.innerHTML = "";
            if (imageList.length) {
                imageList.forEach((img) => {
                    fileList.innerHTML += `<option class="option_fileList" value="${img.index}">${img.index + 1}. ${img.fileName}</option>`;
                })
                filteredFileCounter.innerHTML = ''
            }
            break;
        case "rated":
            fileList.innerHTML = "";
            fileIDList.innerHTML = "";
            if (imageList.length) {
                let counter = 0
                imageList.forEach((img) => {
                    if (parseInt(img.rating)) {
                        fileList.innerHTML += `<option class="option_fileList" value="${img.index}">${img.index + 1}. ${img.fileName}</option>`;
                        fileIDList.innerHTML += `${img.index + 1}, `;
                        counter++
                    }
                })
                filteredFileCounter.innerHTML = `總數：${counter}`
            }
            break;
        case "unrated":
            fileList.innerHTML = "";
            fileIDList.innerHTML = "";
            if (imageList.length) {
                let counter = 0
                imageList.forEach((img) => {
                    if (!parseInt(img.rating) || img.rating == "") {
                        fileList.innerHTML += `<option class="option_fileList" value="${img.index}">${img.index + 1}. ${img.fileName}</option>`;
                        fileIDList.innerHTML += `${img.index + 1}, `;
                        counter++
                    }
                })
                filteredFileCounter.innerHTML = `總數：${counter}`
            }
            break;
        default:
            console.log(type);
            break;
    }
}

/** 更新檔案清單的序號 */
function updateFileList() {
    imageList.map((img, index) => {
        img.index = index
    })
}


/**
 * 顯示圖片超出範圍而被隱藏的部分
 * @param {Element} triggeredBtn 觸發 function 的按鈕元素
 */
function showFullImage(triggeredBtn)
{
    imageContainerGroup[0].style.overflow = imageContainerGroup[0].style.overflow === "clip" ? "hidden" : "clip";
    triggeredBtn.classList.toggle("btnActive");
}

/**
 * 透過按鈕重設圖片位置
 * @param {Element} triggeredBtn 觸發 function 的按鈕元素
 */
function imgPositionReset(triggeredBtn)
{
    switch  (triggeredBtn.id) {
        case "resetBtn_shiftX":
            wallpaperImgGroup[0].style.left = "0px";
            imageList[imageShowIndex].shiftX = 0;
            break;
        case "resetBtn_shiftY":
            wallpaperImgGroup[0].style.top = "0px";
            imageList[imageShowIndex].shiftY = 0;
            break;
        case "resetBtn_Zoom":
            if(imgShowAdjustment("return")) {
                wallpaperImgGroup[0].style.width = "100%";
                imageList[imageShowIndex].zoomRatio = 0;
            } else {
                wallpaperImgGroup[0].style.height = "100%";
                imageList[imageShowIndex].zoomRatio = 0;
            }
            break;
    }
}

/** 
 * 單點切換圖片功能開關
 */
function oneClickFeatureSwitcher()
{
    oneClickFeature = !oneClickFeature
    oneClickFeatureIndicator.innerHTML = oneClickFeature.toString()
}

// ---------- 鍵盤控制 ---------

/**
 * 鍵盤快速鍵
 */
document.addEventListener('keydown', async(event) => {
    if (imageList.length) {
        if (event.key == "ArrowLeft" || event.key == "a" || event.key == "A") {
            showImage('last');
        } else if (event.key == "ArrowRight" || event.key == "d" || event.key == "D") {
            showImage('next');
        } else if (event.key % 1 == 0 && event.key < 6) {
            imageList[imageShowIndex].rating = event.key;
            imageList[imageShowIndex].rating = event.key;
            loadImageInfo("rating");
        } else if (event.key % 1 == 0 && event.key > 6) {
            imageList[imageShowIndex].status = (event.key - 5);
            loadImageInfo("status");
        }
    }
    
    if (event.altKey) {
        isSlowShiftMode = true;
        mouseControlIndicator.innerHTML = "水平移動（細微調整）";
    } else if (event.shiftKey) {
        isVerticalShiftMode = true;
        mouseControlIndicator.innerHTML = "垂直移動";
    } else if (event.ctrlKey) {
        isZoonInMode = true;
        mouseControlIndicator.innerHTML = "縮放";
    }

    if (event.key == "K" || event.key == "k") {
        oneClickFeature = !oneClickFeature
        oneClickFeatureIndicator.innerHTML = oneClickFeature.toString()
    }
})

document.addEventListener('keyup', () => {
    isSlowShiftMode = false;
    isVerticalShiftMode = false;
    isZoonInMode = false;
    mouseControlIndicator.innerHTML = "水平移動";
})

window.addEventListener('blur', () => {
    isSlowShiftMode = false;
    isVerticalShiftMode = false;
    isZoonInMode = false;
    mouseControlIndicator.innerHTML = "水平移動";
})

// ---------- 滑鼠控制 ---------

let mouseStartX, mouseStartY, imageStartLeft, imageStartTop, imageInitScale = 100;
// mouseStartX = 滑鼠游標水平座標初始值
// mouseDiffX = 滑鼠游標水平座標偏移值
// imageStartLeft = 圖片水平座標數值

/**
 * 按下滑鼠左鍵的事件
 */
imageContainerGroup[0].addEventListener('mousedown', (e) => {
    isPressMouseRightKey = true;
    if (!isVerticalShiftMode) {
        mouseStartX = e.clientX;
        if (isNaN(parseInt(wallpaperImgGroup[0].style.left))) {
            imageStartLeft = 0;
        } else {
            imageStartLeft = parseInt(wallpaperImgGroup[0].style.left);
        }
    } else {
        mouseStartY = e.clientY;
        if (isNaN(parseInt(wallpaperImgGroup[0].style.top))) {
            imageStartTop = 0;
        } else {
            imageStartTop = parseInt(wallpaperImgGroup[0].style.top);
        }
    }
    if (isZoonInMode) {
        mouseStartX = e.clientX;
        if (imgShowAdjustment("return")) {
            imageInitScale = parseInt(wallpaperImgGroup[0].style.width);
        } else {
            imageInitScale = parseInt(wallpaperImgGroup[0].style.height);
        }
    }

    if(e.button == 1)
    {
        functionPanelGroup.classList.toggle('hidden')
        fpImageControl.classList.toggle('hidden')
    }
})

document.addEventListener('mouseup', () => {
   isPressMouseRightKey = false;
})


// 順序：是否為縮放 -> 是否為垂直移動 -> 預設 (水平移動)
imageContainerGroup[0].addEventListener('mousemove', (e) => {
    if (isPressMouseRightKey) {
        let mouseDiff = 0;
        if (!isZoonInMode) {
            if (isVerticalShiftMode) {
                if (isSlowShiftMode) {
                    mouseDiff = (e.clientY - mouseStartY) / 8;
                } else {
                    mouseDiff = e.clientY - mouseStartY;
                }
                wallpaperImgGroup[0].style.top = `${imageStartTop + mouseDiff}px`;
                if (imageList[imageShowIndex]) {
                    imageList[imageShowIndex].shiftY = imageStartTop + mouseDiff;
                }
            } else {
                if (isSlowShiftMode) {
                    mouseDiff = (e.clientX - mouseStartX) / 8;
                } else {
                    mouseDiff = e.clientX - mouseStartX;
                }
                wallpaperImgGroup[0].style.left = `${imageStartLeft + mouseDiff}px`;
                if (imageList[imageShowIndex]) {
                    imageList[imageShowIndex].shiftX = imageStartLeft + mouseDiff;
                }
            }
        } else {
            mouseDiff = Math.round((e.clientX - mouseStartX) / 5);
            if (imgShowAdjustment("return")) {
                wallpaperImgGroup[0].style.width = `${imageInitScale + mouseDiff}%`;
                imageList[imageShowIndex].zoomRatio = imageInitScale + mouseDiff;
            } else {
                wallpaperImgGroup[0].style.height = `${imageInitScale + mouseDiff}%`;
                imageList[imageShowIndex].zoomRatio = imageInitScale + mouseDiff;
            }
        }
    }
})

// 雙點重設圖片位置
imageContainerGroup[0].addEventListener('dblclick', () => {
    wallpaperImgGroup[0].style.left = "0px";
    wallpaperImgGroup[0].style.top = "0px";
    if (imgShowAdjustment("return")) {
        wallpaperImgGroup[0].style.width = "100%";
    } else {
        wallpaperImgGroup[0].style.height = "100%";
    }
    if (imageList[imageShowIndex]) {
        imageList[imageShowIndex].shiftX = 0;
        imageList[imageShowIndex].shiftY = 0;
        imageList[imageShowIndex].zoomRatio = 100;
    }
})

/**
 * 使用滑鼠點選檔案列表中的圖片來顯示圖片
 */
fileList.addEventListener('change', () => {
    showImage(parseInt(fileList.value));
})

fileList.addEventListener('keydown', (event) => {
    if (event.key % 1 == 0 && event.key < 6) {
        event.preventDefault();
        imageList[imageShowIndex].rating = event.key;
        imageList[imageShowIndex].rating = event.key;
        loadImageInfo("rating");
    }
})

/**
 * 開啟單點切換後的事件監聽
 */
imageContainerGroup[0].addEventListener('click', () => {
    if (oneClickFeature) {
        showImage('next');
    }
})

functionPanelTitle.addEventListener('click', () => {
    hidePanel()
})

// ---------- DEBUG ---------

function showAllArrayInfo()
{
    console.log("imageList: ");
    console.log(imageList);
    console.log("imageList.length: " + imageList.length);
    console.log("imageLoadIndex: " + imageLoadIndex);
    console.log("imageShowIndex: " + imageShowIndex);
}
