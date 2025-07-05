'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Users, Award, Truck, Shield, Leaf, Star, Globe } from 'lucide-react';

const AboutPage = () => {
  const values = [
    {
      icon: Heart,
      title: 'Passion for Fashion',
      description: 'We believe fashion is a form of self-expression that should be accessible to everyone.',
      color: 'text-red-500'
    },
    {
      icon: Users,
      title: 'Community First',
      description: 'Building a community of fashion lovers who inspire and support each other.',
      color: 'text-blue-500'
    },
    {
      icon: Award,
      title: 'Quality Excellence',
      description: 'Every product is carefully curated and tested to meet our high standards.',
      color: 'text-yellow-500'
    },
    {
      icon: Leaf,
      title: 'Sustainability',
      description: 'Committed to ethical practices and sustainable fashion for a better future.',
      color: 'text-green-500'
    }
  ];

  const team = [
    {
      name: 'K.Rohit',
      role: 'Founder',
      image: '/us/rohit.jpg',
      description: 'Visionary and driving force behind the platform.'
    },
    {
      name: 'C.Namish',
      role: 'Founder',
      image: '/us/namish.jpg',
      description: 'Creative mind and technology enthusiast.'
    }
  ];

  const stats = [
    { number: '50K+', label: 'Happy Customers' },
    { number: '1000+', label: 'Products' },
    { number: '25+', label: 'Cities Served' },
    { number: '4.8', label: 'Average Rating' }
  ];

  const storyImages = [
    '/men/Christian Dior Couture Track Pants.png',
    '/women/Floral Summer Dress.png',
    '/accessories/LOVE bracelet, medium model.png',
    '/sale/Silk and acetate crêpe cady long dress with glistening waterfall embroidery.png'
  ];
  const randomStoryImage = storyImages[Math.floor(Math.random() * storyImages.length)];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 pastel-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              About <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">PastelShop</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              We're on a mission to make fashion personal, sustainable, and accessible. 
              Every piece in our collection is carefully curated to help you express your unique style.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Our Story</h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  Founded in 2020, PastelShop began as a small dream to revolutionize how people discover and shop for fashion. 
                  We noticed that while there were countless fashion options available, finding pieces that truly reflected 
                  individual style was still a challenge.
                </p>
                <p>
                  Our founders, passionate about both fashion and technology, set out to create a platform that would use 
                  personalization and curation to help every customer find their perfect style. What started as a small 
                  team of fashion enthusiasts has grown into a community of over 50,000 happy customers.
                </p>
                <p>
                  Today, we continue to innovate and expand our offerings while staying true to our core values: 
                  quality, sustainability, and putting our customers first.
                </p>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              {/* In the Our Story section, use randomStoryImage for the image src */}
              <img
                src={randomStoryImage}
                alt="Our Story"
                className="rounded-2xl shadow-xl"
              />
              <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl p-6 shadow-xl">
                <div className="flex items-center space-x-2">
                  <Star className="w-6 h-6 text-yellow-500 fill-current" />
                  <div>
                    <div className="font-bold text-gray-900">4.8/5</div>
                    <div className="text-sm text-gray-600">Customer Rating</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-gradient-to-br from-pastel-mint/10 to-pastel-lavender/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Values</h2>
            <p className="text-xl text-gray-600">The principles that guide everything we do</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300"
              >
                <div className={`w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 ${value.color}`}>
                  <value.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{value.title}</h3>
                <p className="text-gray-600">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-pink-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-white mb-4">Our Impact</h2>
            <p className="text-xl text-purple-100">Numbers that tell our story</p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">{stat.number}</div>
                <div className="text-purple-100">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Meet Our Team</h2>
            <p className="text-xl text-gray-600">The passionate people behind PastelShop</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {team.map((member, index) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="text-center group"
              >
                <div className="relative mb-4">
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-32 h-32 rounded-full mx-auto object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 rounded-full bg-gradient-to-t from-purple-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-1">{member.name}</h3>
                <p className="text-purple-600 font-medium mb-3">{member.role}</p>
                <p className="text-gray-600 text-sm">{member.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 bg-gradient-to-br from-pastel-peach/10 to-pastel-skyblue/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Our Mission</h2>
            <p className="text-xl text-gray-600 leading-relaxed mb-8">
              To democratize fashion by making personalized, high-quality clothing accessible to everyone, 
              while building a sustainable future for the fashion industry. We believe that everyone deserves 
              to feel confident and express their unique style, regardless of their budget or location.
            </p>
            <div className="flex items-center justify-center space-x-8">
              <div className="flex items-center space-x-2">
                <Globe className="w-6 h-6 text-purple-600" />
                <span className="text-gray-700">Global Reach</span>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="w-6 h-6 text-purple-600" />
                <span className="text-gray-700">Trusted Quality</span>
              </div>
              <div className="flex items-center space-x-2">
                <Truck className="w-6 h-6 text-purple-600" />
                <span className="text-gray-700">Fast Delivery</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage; 