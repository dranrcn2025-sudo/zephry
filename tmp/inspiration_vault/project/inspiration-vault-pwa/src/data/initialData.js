export const initialData = {
  books: [
    {
      id: 'fortuna', title: 'Fortuna', author: '桐青璃落', tags: ['奇幻', '西方'],
      cover: '🌙', coverImage: null, color: '#2D3047', showStats: true,
      entries: [
        {
          id: 'worldview', title: '世界观', summary: '关于这个世界', content: '', isFolder: true, linkable: false,
          children: [
            {
              id: 'religion', title: '宗教', summary: '神祇与信仰', content: '', isFolder: true, linkable: false,
              children: [
                { id: 'ten-days', title: '十日旧约', summary: '创世传说', linkable: true, isFolder: false, content: '<p>　　在时间的起点，女神独自漂浮于无尽的寂静之中。</p><p>　　第一日，她从心火中分离出【火的守望】。</p><p>　　第二日，从泪水中分离出【水的祝福】。</p>', children: [] },
                { id: 'war-gods', title: '战争双神', summary: '胜利与牺牲', linkable: true, isFolder: false, content: '<p>　　<b>胜利者·凯洛斯</b>，身披金色战甲。</p><p>　　<i>牺牲者·赛莲娜</i>，身着银色长袍。</p>', children: [] }
              ]
            },
            {
              id: 'geography', title: '地理', summary: '大陆疆域', content: '', isFolder: true, linkable: false,
              children: [
                { id: 'koltra', title: '柯尔特拉', summary: '中央王国', linkable: true, isFolder: true, content: '<p>　　位于大陆正中央，被称为"女神的掌心"。</p>', 
                  children: [
                    { id: 'silver-city', title: '银冠城', summary: '首都', linkable: true, isFolder: false, content: '<p>　　首都建立在白色岩石上，城中有【千年图书馆】。</p>', children: [] }
                  ] },
                { id: 'northland', title: '北境', summary: '冰雪王国', linkable: true, isFolder: false, content: '<p>　　永恒冬季笼罩的土地，居民是【霜裔】后代。</p>', children: [] }
              ]
            }
          ]
        },
        {
          id: 'characters', title: '人物', summary: '故事灵魂', content: '', isFolder: true, linkable: false,
          children: [
            { id: 'elena', title: '艾琳娜', summary: '流亡公主', linkable: true, isFolder: false, content: '<p>　　【柯尔特拉】末代国王的独生女。在【千年图书馆】长大，对【十日旧约】研究深入。</p>', children: [] }
          ]
        }
      ]
    },
    {
      id: 'jade-book', title: '玉辞', author: '桐青璃落', tags: ['古风'],
      cover: '🏯', coverImage: null, color: '#4A0E0E', showStats: true,
      entries: [
        { id: 'jade-chars', title: '人物', summary: '江湖儿女', content: '<p>　　曾有异世旅人【艾琳娜】短暂停留……</p>', isFolder: true, linkable: false, children: [] }
      ]
    }
  ]
};
