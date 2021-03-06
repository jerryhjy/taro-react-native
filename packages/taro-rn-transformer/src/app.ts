import * as path from 'path'
import * as fs from 'fs'
import { isEmptyObject } from '@tarojs/helper'
import { camelCase } from 'lodash'
import { getConfigContent, getConfigFilePath } from './utils'
import { TransformEntry, AppConfig, globalAny } from './types/index'

function getPagesResource (config: AppConfig, basePath: string, pathPrefix: string) {
  const importPages: string[] = []
  const screenPages: string[] = []
  const importConfigs: string[] = []
  const pages = config.pages || []
  if (!config.pages) return { screenPages, importPages, importConfigs }
  // 分包路由，也需要处理
  const subPackages = config.subPackages || config.subpackages || []
  subPackages.forEach(item => {
    const subRoot = item.root.endsWith('/') ? item.root : `${item.root}/`
    const subPages = item.pages
    subPages.forEach(itm => {
      pages.push(subRoot + itm)
    })
  })
  pages.forEach(item => {
    const pagePath = item.startsWith('/') ? item : `/${item}`
    const screenName = camelCase(pagePath)
    const importScreen = `import ${screenName} from '.${pathPrefix}${pagePath}'`
    importPages.push(importScreen)
    screenPages.push(pagePath)
    const configFile = getConfigFilePath(path.join(basePath, pagePath))
    if (fs.existsSync(configFile)) {
      importConfigs.push(`import '.${pathPrefix}${pagePath}.config'`)
    }
  })
  return {
    screenPages,
    importPages,
    importConfigs
  }
}

function getPageScreen (pagePath: string, basePath: string) {
  const configPath = path.join(basePath, pagePath)
  const screen = camelCase(pagePath)
  const pageConfig = getPageConfig(configPath)
  pageConfig.pagePath = pagePath
  const configString = JSON.stringify(pageConfig)

  return `{name:'${screen}',pagePath:'${pagePath}',component:createPageConfig(${screen},${configString})}`
}

function getPageConfig (resourcePath: string) {
  if (!resourcePath) return {}
  const content = getConfigContent(resourcePath)
  return content
}

function getAppConfig (appPath: string) {
  // 读取配置文件内容
  if (!appPath) {
    throw new Error('缺少 app 全局配置文件，请检查！')
  }
  const appConfig: AppConfig = getConfigContent(appPath)
  if (isEmptyObject(appConfig)) {
    throw new Error('缺少 app 全局配置，请检查！')
  }
  if (appConfig && (!appConfig.pages || !appConfig.pages.length)) {
    throw new Error('全局配置缺少 pages 字段，请检查！')
  }
  return appConfig
}

export default function generateEntry ({
  filename,
  projectRoot,
  sourceDir,
  appName,
  entryName,
  designWidth,
  deviceRatio
}: TransformEntry) {
  // 文件后缀
  const filePath = path.basename(filename).replace(path.extname(filename), '')
  const basePath = path.join(projectRoot, sourceDir)
  const appPath = path.join(projectRoot, sourceDir, entryName)

  const appConfig = getAppConfig(appPath)
  appConfig.designWidth = designWidth
  appConfig.deviceRatio = deviceRatio

  const pathPrefix = filePath.indexOf(sourceDir) > -1 ? '' : `/${sourceDir}`
  const pages = getPagesResource(appConfig, basePath, pathPrefix)
  const importPageList = pages.importPages.join(';')
  const importPageConfig = pages.importConfigs.join(';')
  const routeList = pages.screenPages

  // 所有页面存一下，用于判断是否页面文件
  globalAny.__taroAppPages = pages.screenPages.map(item => sourceDir + item)

  // TODO transform 引用文件问题,默认为App
  const appComponentPath = `./${sourceDir}/${entryName}`
  //
  const code = `import 'react-native/Libraries/polyfills/error-guard'
  import { AppRegistry } from 'react-native'
  import { createReactNativeApp } from '@tarojs/runtime-rn'
  import { createPageConfig } from '@tarojs/runtime-rn'
  import Component from '${appComponentPath}'
  ${importPageList}
  ${process.env.NODE_ENV === 'development' ? `import '${appComponentPath}.config.ts';${importPageConfig};` : ''}

  var config = ${JSON.stringify({ appConfig: appConfig })}
  global.__taroAppConfig = config
  config['pageList'] = [${routeList.map(pageItem => getPageScreen(pageItem, basePath))}]
  AppRegistry.registerComponent('${appName}',() => createReactNativeApp(Component,config))
  `
  return code
}
